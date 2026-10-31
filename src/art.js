// Avatar glyphs for the lobby and HUD. Card art has been removed: cards are
// rendered as text-first tactical panels.

export function avatarGlyph(name) {
  const clean = String(name || '?').replace(/[^A-Za-z0-9]/g, '');
  return (clean[0] || '?').toUpperCase();
}
