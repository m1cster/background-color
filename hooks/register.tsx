import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, ThemeSetArgs } from 'claude-code'

import type { Applied } from '../types'
import { anchorsFor, normalizeHex, towardMode } from './color.js'
import type { Mode } from './color.js'
import { makeColors } from './make-colors.js'

const PLUGIN = 'background-color'
const PANE = 'background-color'
const TITLE = 'Background color'

const DEFAULTS: Record<Mode, string> = { light: '#f3efe6', dark: '#1b1d22' }

const PRESETS: Record<Mode, ReadonlyArray<readonly [string, string]>> = {
  light: [
    ['Paper', '#f3efe6'],
    ['Mist', '#eef2f5'],
    ['Sage', '#edf2ea'],
    ['Blush', '#f7eeee'],
    ['White', '#ffffff'],
  ],
  dark: [
    ['Slate', '#1b1d22'],
    ['Ink', '#14161c'],
    ['Forest', '#16201b'],
    ['Plum', '#1f1a24'],
    ['Black', '#0b0b0b'],
  ],
}

const FIELD: Record<Mode, 'lightBackground' | 'darkBackground'> = {
  light: 'lightBackground',
  dark: 'darkBackground',
}

const TEXT_FIELD: Record<Mode, 'lightText' | 'darkText'> = {
  light: 'lightText',
  dark: 'darkText',
}

/** An old monochrome monitor: P1 phosphor green on a faintly green black. */
const GREEN_SCREEN = { background: '#020c02', text: '#33ff33' }

// Change the tag when Applied's fields change: it declines what an earlier
// version stored, which outlives a reload.
const applied = atom(
  { plugin: 'background-color', key: 'applied' } as const,
  {
    light: DEFAULTS.light,
    dark: DEFAULTS.dark,
    lightText: '',
    darkText: '',
    isEnabled: true,
    isDrawn: false,
    isPainting: false,
    note: '',
  },
  { shape: 'applied-3' },
)

type Texts = Record<Mode, string | undefined>

type Resolved = { light: string; dark: string; text: Texts; isEnabled: boolean; notes: string[] }

/** The options as colors to paint: blank means the default, a bad value is noted and replaced. */
function resolve(options: PluginOptions): Resolved {
  const notes: string[] = []
  const pick = (mode: Mode): string => {
    const raw = options[FIELD[mode]]

    if (typeof raw !== 'string' || raw.trim() === '') {
      return DEFAULTS[mode]
    }
    const hex = normalizeHex(raw)

    if (hex === undefined) {
      notes.push(`"${raw}" isn't a hex color, so ${mode} mode uses ${DEFAULTS[mode]}.`)

      return DEFAULTS[mode]
    }

    return hex
  }
  // A text color is optional: blank (or "auto") follows the page color.
  const pickText = (mode: Mode): string | undefined => {
    const raw = options[TEXT_FIELD[mode]]

    if (typeof raw !== 'string' || raw.trim() === '' || raw.trim().toLowerCase() === 'auto') {
      return undefined
    }
    const hex = normalizeHex(raw)

    if (hex === undefined) {
      notes.push(`"${raw}" isn't a hex color, so ${mode} mode text follows the page color.`)
    }

    return hex
  }

  return {
    light: pick('light'),
    dark: pick('dark'),
    text: { light: pickText('light'), dark: pickText('dark') },
    isEnabled: options.enabled !== false,
    notes,
  }
}

function anchorsSafe(hex: string, mode: Mode, text: string | undefined) {
  return { gray: { anchors: anchorsFor(hex, mode, text) } }
}

/** Whether Desktop paints a mode built on this page color, with the app's own roles. */
function paints(hex: string, mode: Mode, text: string | undefined): boolean {
  try {
    const { problems } = makeColors({ label: 'Check', [mode]: anchorsSafe(hex, mode, text), only: mode })

    return !problems.some(line => line.startsWith("Desktop won't paint"))
  } catch {
    return false
  }
}

/**
 * The page color nearest to the one asked for that Desktop paints: moved
 * toward white (light mode) or black (dark mode) only as far as the text and
 * accents need to stay readable.
 */
function fit(hex: string, mode: Mode, text: string | undefined): string {
  for (let i = 0; i <= 50; i++) {
    const candidate = towardMode(hex, mode, i * 0.02)

    if (paints(candidate, mode, text)) {
      return candidate
    }
  }

  return DEFAULTS[mode]
}

/** The whole theme for a light and a dark page color, and their text colors where set. */
function lookFor(light: string, dark: string, text: Texts): ThemeSetArgs {
  const { theme } = makeColors({
    label: 'Custom background',
    light: anchorsSafe(light, 'light', text.light),
    dark: anchorsSafe(dark, 'dark', text.dark),
  })

  return { colors: theme }
}

type Field = 'enabled' | 'lightBackground' | 'darkBackground' | 'lightText' | 'darkText'

/**
 * Paints the theme for these settings and records it for the pane. `isAsked`
 * is true for a change the person just made: only then does a problem toast,
 * so a load or a reload never nags.
 */
async function apply($: EngineInterface, options: PluginOptions, isAsked: boolean): Promise<void> {
  const { light, dark, text, isEnabled, notes } = resolve(options)
  const texts = { lightText: text.light ?? '', darkText: text.dark ?? '' }

  if (!isEnabled) {
    const before = await read($, applied)

    // Turned off (the pane, the command, or the app's plugin settings, whose
    // change reloads the module) while this mod's theme stands: the person's
    // ask for the app's own look back. A fresh session has painted nothing.
    if (before.isPainting) {
      await $.theme.clear()
    }
    await update($, applied, () => ({
      light,
      dark,
      ...texts,
      isEnabled,
      isDrawn: false,
      isPainting: false,
      note: notes.join(' '),
    }))

    return
  }

  const page = { light: fit(light, 'light', text.light), dark: fit(dark, 'dark', text.dark) }

  for (const mode of ['light', 'dark'] as const) {
    const asked = mode === 'light' ? light : dark

    if (page[mode] !== asked) {
      notes.push(
        `${asked} is too ${mode === 'light' ? 'dark' : 'light'} for ${mode} mode text to stay readable, so ${page[mode]} is painted.`,
      )
    }
  }
  let look: ThemeSetArgs

  try {
    look = lookFor(page.light, page.dark, text)
  } catch (error) {
    notes.push(`Those colors couldn't make a theme (${String(error)}), so the defaults are painted.`)
    page.light = DEFAULTS.light
    page.dark = DEFAULTS.dark
    texts.lightText = ''
    texts.darkText = ''
    look = lookFor(page.light, page.dark, { light: undefined, dark: undefined })
  }
  // A surface that draws no themes (a terminal) is not a problem: the theme
  // stands and a desktop or mobile app that attaches draws it.
  const result = await $.theme.set(look)

  if (isAsked && notes.length > 0) {
    $.ui.toast(`Background color: ${notes[0]}`)
  }
  await update($, applied, () => ({
    light: page.light,
    dark: page.dark,
    ...texts,
    isEnabled,
    isDrawn: result.isDrawn,
    isPainting: true,
    note: notes.join(' '),
  }))
}

/** Writes one of this mod's settings; the engine then reloads the module with it. */
async function setOption($: EngineInterface, field: Field, value: string | boolean): Promise<string | undefined> {
  const exact = `${PLUGIN}.${field}`
  const rows = await $.config.list()
  // A row's provider is the plugin's id: `background-color@inline` for this
  // mods folder, `background-color@<marketplace>` once installed.
  const isOurs = (id: string) => id === PLUGIN || id.startsWith(`${PLUGIN}@`)
  const ours = rows.filter(one => isOurs(one.provider.plugin) && one.key.endsWith(`.${field}`))
  // The key is `<name>.<field>`, unless two loaded plugins share the name and
  // the engine keys each by its id: then refuse rather than guess.
  const row = ours.find(one => one.key === exact) ?? (ours.length === 1 ? ours[0] : undefined)

  if (row === undefined && ours.length > 1) {
    return `more than one copy of ${PLUGIN} is loaded (${ours.map(one => one.key).join(', ')}). Turn one off, then try again.`
  }
  try {
    const { deny } = await $.config.set({ key: row?.key ?? exact, value })

    return deny
  } catch (error) {
    return String(error)
  }
}

// The person's edits run one at a time. Each saves its setting, then repaints
// at once from every setting saved so far (the reload the save causes paints
// the same again), so two quick presses never paint one mode's old color.
// Module variables start over at a reload, which brings the saved options.
let saved: Record<string, string | number | boolean | readonly string[]> = {}
let queue: Promise<unknown> = Promise.resolve()

function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)

  return run
}

async function refuse($: EngineInterface, note: string): Promise<string> {
  await update($, applied, now => ({ ...now, note }))

  return note
}

async function setColor($: EngineInterface, mode: Mode, input: string): Promise<string> {
  return inTurn(async () => {
    const hex = input.trim() === '' ? DEFAULTS[mode] : normalizeHex(input)

    if (hex === undefined) {
      return refuse($, `"${input}" isn't a hex color. Try one like ${DEFAULTS[mode]}.`)
    }
    const deny = await setOption($, FIELD[mode], hex)

    if (deny !== undefined) {
      return refuse($, `Couldn't save the ${mode} background: ${deny}`)
    }
    saved[FIELD[mode]] = hex
    await apply($, saved, true)

    return `${mode === 'light' ? 'Light' : 'Dark'} mode background set to ${hex}.`
  })
}

async function setText($: EngineInterface, mode: Mode, input: string): Promise<string> {
  return inTurn(async () => {
    const isAuto = input.trim() === '' || input.trim().toLowerCase() === 'auto'
    const hex = isAuto ? '' : normalizeHex(input)

    if (hex === undefined) {
      return refuse($, `"${input}" isn't a hex color. Try one like ${GREEN_SCREEN.text}, or auto.`)
    }
    const deny = await setOption($, TEXT_FIELD[mode], hex)

    if (deny !== undefined) {
      return refuse($, `Couldn't save the ${mode} text color: ${deny}`)
    }
    saved[TEXT_FIELD[mode]] = hex
    await apply($, saved, true)

    const name = mode === 'light' ? 'Light' : 'Dark'

    return hex === '' ? `${name} mode text follows the page color again.` : `${name} mode text set to ${hex}.`
  })
}

async function setEnabled($: EngineInterface, isEnabled: boolean): Promise<string> {
  return inTurn(async () => {
    const deny = await setOption($, 'enabled', isEnabled)

    if (deny !== undefined) {
      return refuse($, `Couldn't change the setting: ${deny}`)
    }
    saved.enabled = isEnabled
    await apply($, saved, true)

    return isEnabled ? 'Custom background on.' : "Custom background off: the app's own look is back."
  })
}

const HELP = [
  'Usage:',
  '  /background-color                 open the settings pane',
  '  /background-color light #f3efe6   set the light mode background',
  '  /background-color dark #1b1d22    set the dark mode background',
  '  /background-color light           show the light mode background',
  '  /background-color dark-text #33ff33  set the dark mode text color',
  '  /background-color dark-text auto  text follows the page color again',
  '  /background-color green-screen    dark mode as an old green monitor',
  '  /background-color reset           both back to the defaults',
  '  /background-color on | off        paint the custom background, or not',
].join('\n')

export const register: Register = (on, options) => {
  saved = { ...options }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'background-color',
      description: 'Set the background color for light and dark mode',
      argumentHint: '[light|dark|light-text|dark-text <#hex> | green-screen | reset | on | off]',
    })
    await apply($, options, false)

    return next(e)
  })

  on('command.run', { command: 'background-color' }, async ($, e) => {
    const [verb = '', value = ''] = e.args.trim().split(/\s+/)

    switch (verb.toLowerCase()) {
      case '': {
        const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE, focus: true })

        return {
          text: isPlaced
            ? 'Background color settings opened.'
            : `Nothing here draws the settings pane.\n${HELP}`,
        }
      }
      case 'light':
      case 'dark': {
        const mode = verb.toLowerCase() as Mode

        if (value === '') {
          const now = await read($, applied)

          return { text: `${mode === 'light' ? 'Light' : 'Dark'} mode background is ${now[mode]}.\n${HELP}` }
        }

        return { text: await setColor($, mode, value) }
      }
      case 'light-text':
      case 'dark-text': {
        const mode = verb.toLowerCase() === 'light-text' ? 'light' : 'dark'

        if (value === '') {
          const now = await read($, applied)
          const current = mode === 'light' ? now.lightText : now.darkText

          return {
            text: `${mode === 'light' ? 'Light' : 'Dark'} mode text is ${current === '' ? 'auto (follows the page color)' : current}.\n${HELP}`,
          }
        }

        return { text: await setText($, mode, value) }
      }
      case 'green-screen': {
        const background = await setColor($, 'dark', GREEN_SCREEN.background)
        const text = await setText($, 'dark', GREEN_SCREEN.text)

        return { text: `${background}\n${text}` }
      }
      case 'reset': {
        const light = await setColor($, 'light', '')
        const dark = await setColor($, 'dark', '')

        return { text: `${light}\n${dark}` }
      }
      case 'on':
      case 'off':
        return { text: await setEnabled($, verb.toLowerCase() === 'on') }
      default:
        return { text: HELP }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const now = await read($, applied)

    const section = (mode: Mode) => (
      <Box flexDirection="column" gap={1}>
        <Text bold>{mode === 'light' ? 'Light mode' : 'Dark mode'}</Text>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Box
            width={4}
            height={2}
            borderStyle="round"
            borderColor={mode === 'light' ? '#c8c2b4' : '#4a4d55'}
            backgroundColor={now[mode]}
          />
          <Input
            key={`${mode}-hex`}
            label="Hex"
            value={now[mode]}
            placeholder={DEFAULTS[mode]}
            submitLabel="apply"
            onSubmit={value => void setColor($, mode, value)}
          />
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {PRESETS[mode].map(([name, hex]) => (
            <Button
              key={`${mode}-${name}`}
              label={name}
              variant={now[mode] === hex ? 'primary' : 'secondary'}
              onPress={() => void setColor($, mode, hex)}
            />
          ))}
          <Button key={`${mode}-default`} dimColor label="Default" onPress={() => void setColor($, mode, '')} />
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Input
            key={`${mode}-text`}
            label="Text"
            value={mode === 'light' ? now.lightText : now.darkText}
            placeholder="auto"
            submitLabel="apply"
            onSubmit={value => void setText($, mode, value)}
          />
          <Button key={`${mode}-text-auto`} dimColor label="Auto" onPress={() => void setText($, mode, '')} />
          {mode === 'dark' && (
            <Button
              key="green-screen"
              label="Green screen"
              variant={now.dark === GREEN_SCREEN.background && now.darkText === GREEN_SCREEN.text ? 'primary' : 'secondary'}
              onPress={() => {
                void setColor($, 'dark', GREEN_SCREEN.background)
                void setText($, 'dark', GREEN_SCREEN.text)
              }}
            />
          )}
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={2} padding={1}>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Button
            key="enabled"
            label={now.isEnabled ? 'Turn off' : 'Turn on'}
            variant={now.isEnabled ? 'secondary' : 'primary'}
            onPress={() => void setEnabled($, !now.isEnabled)}
          />
          <Text dimColor>
            {now.isEnabled ? 'Painting your colors.' : "Off: the app's own look."}
          </Text>
        </Box>
        {section('light')}
        {section('dark')}
        {now.note !== '' && <Text color="warning">{now.note}</Text>}
        {now.isEnabled && !now.isDrawn && (
          <Text dimColor>This surface draws no themes; the desktop and mobile apps paint these colors.</Text>
        )}
        <Text dimColor>
          Type a hex color and press Enter, or pick a preset. Cards and panels follow the page color, and so does
          text unless you give it a color of its own.
        </Text>
      </Box>
    )
  })
}
