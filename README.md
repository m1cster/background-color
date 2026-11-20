# background-color

A Claude Code mod that sets the background color for light mode and dark mode in the Claude desktop and mobile apps. Pick one color per mode: the mod builds the page, slightly lifted cards and panels, and text tinted to the same hue that keeps readable contrast (7:1 for main text, 4.5:1 for muted text).

## Why

This mod is for people who use several Claude licenses, for example one per client. Give each Claude instance its own background color, and you can tell at a glance which license a window is running under. That makes it harder to do one client's work under another client's account.

The colors are stored in the `settings.json` of the Claude config directory (`~/.claude` by default). Instances that share a config directory share colors, so give each license its own config directory (for example with `CLAUDE_CONFIG_DIR`) and set the colors in each one.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install background-color --marketplace m1cster/background-color
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install background-color --marketplace m1cster/background-color
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `m1cster/background-color`, then Add plugin.

## Configure it

- **Settings pane:** run `/background-color` to open a pane with a swatch, a hex field and presets for each mode, plus an on/off switch.
- **Old monitors:** two presets make dark mode look like an old monochrome monitor. `/background-color green-screen` (or the Green screen button in the pane) gives P1 phosphor green text (`#33ff33`) on a faintly green black (`#020c02`); `/background-color amber-screen` (or Amber screen) gives P3 phosphor amber (`#ffb000`) on a faintly amber black (`#0c0700`).
- **Command:** `/background-color light #f3efe6` and `/background-color dark #1b1d22` set a background; `/background-color dark-text #33ff33` sets a text color and `/background-color dark-text auto` lets text follow the background again (`light-text` likewise); a mode named with no color shows the current one; `/background-color reset`, `/background-color on` and `/background-color off` do what they say.
- **Plugin settings:** the fields `Light mode background`, `Dark mode background`, `Light mode text`, `Dark mode text` and `Custom background` appear wherever the app lists plugin options, and are stored in `settings.json` under `pluginConfigs["background-color"].options`.

Colors are hex (`#abc` or `#aabbcc`). A blank background uses the mod's default; a blank text color follows the background. A text color you set keeps its hue, and its secondary and muted strengths are darker shades of it. A color too dark for light mode (or too light for dark mode) to keep text readable is nudged to the nearest one that is, and the pane says so. The terminal draws no themes, so there the mod only stores the settings, which the desktop and mobile apps paint.

## License

MIT, see [LICENSE](LICENSE). `hooks/make-colors.js` and `hooks/make-colors.d.ts` come from Claude Code and are not covered by it; see [NOTICE](NOTICE).
