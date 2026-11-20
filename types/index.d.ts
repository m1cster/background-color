/** What the last apply of the theme came to, shown in the settings pane. */
export type Applied = {
  /** The light-mode page color painted, six-digit hex. */
  light: string
  /** The dark-mode page color painted, six-digit hex. */
  dark: string
  /** Whether the mod is painting at all. */
  isEnabled: boolean
  /** Whether an attached client draws themes (false in a terminal). */
  isDrawn: boolean
  /** Whether this mod's theme stands in this session (set and not cleared). */
  isPainting: boolean
  /** Why a color was refused or adjusted; empty when all is well. */
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    'background-color': { applied: Shaped<Applied> }
  }
}
