export const lines = text => [...new Set(text.split('\n').map(s => s.trim()).filter(Boolean))];
export const key = c => JSON.stringify([c.sub, c.format, c.angle]);

export function mix(niche, subs, formats, angles) {
  const out = [];
  for (const sub of subs) for (const format of formats) for (const angle of angles)
    out.push({ sub, format, angle, brief: `${format} video: ${angle.toLowerCase()} on ${sub} (${niche})` });
  return out;
}
