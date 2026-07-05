// Resolves the progressive accumulation buffer to the canvas:
// average -> exposure -> ACES filmic -> sRGB encode.

struct Uniforms {
  camPos: vec4f,
  camForward: vec4f,
  camRight: vec4f,
  camUp: vec4f,
  resolution: vec4u,  // x,y = render size, z = frameIndex, w = sampleCount
  params0: vec4u,
  params1: vec4f,
  params2: vec4f,     // x = exposure (stops), w = denoise strength (0/1)
  params3: vec4f,     // x = upsampling flag (render res < display res)
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
// Two vec4 per pixel: [idx*2] radiance+count, [idx*2+1] normal+depth guide.
@group(0) @binding(1) var<storage, read> accum: array<vec4f>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) vi: u32) -> VSOut {
  // fullscreen triangle
  var out: VSOut;
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  return out;
}

// Narkowicz ACES fit.
fn aces(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn resolveAt(base: u32) -> vec3f {
  let d = accum[base];
  return d.rgb / max(d.a, 1.0);
}

/**
 * Joint bilateral reconstruction: one gather that both UPSCALES the (possibly
 * lower-res) accumulation buffer to the display and denoises it, guided by the
 * primary-hit normal + depth g-buffer so edges stay crisp. This is what makes
 * a reduced render scale look clean instead of blocky — render at 60% and get
 * a sharp full-res image, the browser-native answer to DLSS/FSR upscaling.
 *
 * `denoiseOn` adds the colour-range (noise) term, which fades as samples grow.
 */
fn reconstruct(uv: vec2f, res: vec2u, denoiseOn: bool) -> vec3f {
  let fres = vec2f(res);
  let rc = uv * fres - vec2f(0.5);         // continuous texel coordinate
  let base = floor(rc);
  let cpx = vec2u(clamp(rc + vec2f(0.5), vec2f(0.0), fres - vec2f(1.0)));
  let cbase = (cpx.y * res.x + cpx.x) * 2u;
  let samples = max(accum[cbase].a, 1.0);
  let cCenter = accum[cbase].rgb / samples;
  let gb0 = accum[cbase + 1u];
  let n0 = gb0.xyz;
  let depth0 = gb0.w;
  let useEdges = depth0 > 0.0;             // foreground surface (not sky)
  // Colour tolerance widens while noisy, tightens as it converges.
  let sigmaC = mix(0.55, 0.06, clamp(samples / 64.0, 0.0, 1.0));
  // Spatial kernel: tight for a 1:1 denoise (stays sharp), wider when the
  // render is below display resolution (smooth, bilinear-like upscaling).
  let sigmaS = select(0.42, 0.62, uni.params3.x > 0.5);
  let sigmaS2 = sigmaS * sigmaS;

  var sum = vec3f(0.0);
  var wsum = 0.0;
  for (var dy = -1; dy <= 2; dy++) {
    for (var dx = -1; dx <= 2; dx++) {
      let p = base + vec2f(f32(dx), f32(dy));
      let ip = vec2u(clamp(p, vec2f(0.0), fres - vec2f(1.0)));
      let sidx = (ip.y * res.x + ip.x) * 2u;
      let cn = resolveAt(sidx);
      let d = p - rc;
      var w = exp(-dot(d, d) / (2.0 * sigmaS2));
      if (useEdges) {
        let gbn = accum[sidx + 1u];
        if (gbn.w > 0.0) {
          w *= pow(max(dot(n0, gbn.xyz), 0.0), 32.0);
          w *= exp(-abs(depth0 - gbn.w) / (0.3 * depth0 + 1e-3));
          if (denoiseOn) {
            let dc = cn - cCenter;
            w *= exp(-dot(dc, dc) / (2.0 * sigmaC * sigmaC));
          }
        } else {
          w = 0.0; // don't pull the background into a foreground pixel
        }
      }
      sum += cn * w;
      wsum += w;
    }
  }
  if (wsum <= 1e-6) { return cCenter; }
  return sum / wsum;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let res = uni.resolution.xy;
  let upsampling = uni.params3.x > 0.5;
  let denoiseOn = uni.params2.w > 0.5;
  var c: vec3f;
  if (!upsampling && !denoiseOn) {
    // 1:1 with denoise off — sample directly for maximum sharpness.
    let px = min(vec2u(in.uv * vec2f(res)), res - 1u);
    c = resolveAt((px.y * res.x + px.x) * 2u);
  } else {
    c = reconstruct(in.uv, res, denoiseOn);
  }
  c *= exp2(uni.params2.x);
  c = aces(c);
  // manual sRGB encode (canvas view format is non-srgb unorm)
  c = pow(c, vec3f(1.0 / 2.4)) * 1.055 - 0.055;
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  return vec4f(c, 1.0);
}
