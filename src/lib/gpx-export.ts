// ============================================================
// BreathEasy SG — GPX Export with scoring extensions
// ============================================================

import type { AnalyzedRoute } from "@/types";

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function generateScoredGPX(route: AnalyzedRoute): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="BreathEasy SG"',
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:breatheasy="https://breatheasy.sg/gpx/1"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <metadata>',
    `    <name>${escapeXml(route.name)}</name>`,
    `    <desc>BreathEasy score: ${route.rating.overall}/100. ${escapeXml(route.rating.summary)}</desc>`,
    `    <time>${route.analyzedAt}</time>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${escapeXml(route.name)}</name>`,
    '    <trkseg>',
  ];

  for (const p of route.scoredPoints) {
    lines.push(`      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">`);
    lines.push('        <extensions>');
    lines.push(`          <breatheasy:score>${p.score.toFixed(1)}</breatheasy:score>`);
    lines.push(`          <breatheasy:band>${p.band}</breatheasy:band>`);
    if (p.greenZone) lines.push('          <breatheasy:greenZone>true</breatheasy:greenZone>');
    if (p.industrialZone) lines.push('          <breatheasy:industrialZone>true</breatheasy:industrialZone>');
    lines.push('        </extensions>');
    lines.push('      </trkpt>');
  }

  lines.push('    </trkseg>', '  </trk>', '</gpx>');
  return lines.join('\n');
}

export function downloadGPX(route: AnalyzedRoute): void {
  const xml = generateScoredGPX(route);
  const blob = new Blob([xml], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${route.name.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50)}-scored.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
