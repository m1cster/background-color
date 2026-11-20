import { expect, test } from 'claude-code/testing'
import type { On, ThemeSetArgs } from 'claude-code'

const PANE = {
  plugin: 'background-color',
  component: 'Pane',
  requestId: 'background-color',
  props: {
    title: 'Background color',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/** Stands for the engine beneath the mod; records what it paints and saves. */
function engine(on: On, deny?: string) {
  const seen = { themes: [] as ThemeSetArgs[], sets: [] as { key: string; value: unknown }[], clears: 0, toasts: [] as string[] }

  on('command.register', () => ({ value: { command: 'background-color' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', (_, e) => {
    seen.themes.push(e)

    return { value: { isDrawn: true, requestId: `t${seen.themes.length}` } }
  })
  on('theme.clear', () => {
    seen.clears++

    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('config.list', () => ({ value: [] }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('config.set', (_, e) => {
    seen.sets.push({ key: e.key, value: e.value })

    return deny === undefined ? { value: e.value } : { deny }
  })

  return seen
}

const start = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const run = (args: string) =>
  ({
    command: 'background-color',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  }) as const

test('paints a theme at session start from the defaults', async ($, on) => {
  const seen = engine(on)
  await $.session.start(start)

  expect(seen.themes.length).toBe(1)
  expect(seen.themes[0]?.colors).toBeDefined()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'light-hex' }))?.props.value).toBe('#f3efe6')
  expect((await ui.find({ key: 'dark-hex' }))?.props.value).toBe('#1b1d22')
  await ui.unmount()
})

test('takes the colors from the settings', { options: { lightBackground: 'EEF', darkBackground: '#14161C' } }, async ($, on) => {
  engine(on)
  await $.session.start(start)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'light-hex' }))?.props.value).toBe('#eeeeff')
  expect((await ui.find({ key: 'dark-hex' }))?.props.value).toBe('#14161c')
  await ui.unmount()
})

test('a value that is not hex falls back and says so', { options: { lightBackground: 'teal' } }, async ($, on) => {
  engine(on)
  await $.session.start(start)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'light-hex' }))?.props.value).toBe('#f3efe6')
  expect(await ui.find({ type: 'Text', text: /isn't a hex color/ })).toBeDefined()
  await ui.unmount()
})

test('a light-mode color too dark to read is lifted', { options: { lightBackground: '#1b1d22' } }, async ($, on) => {
  engine(on)
  await $.session.start(start)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'light-hex' }))?.props.value).not.toBe('#1b1d22')
  expect(await ui.find({ type: 'Text', text: /too dark/ })).toBeDefined()
  await ui.unmount()
})

test('the command saves a color and repaints', async ($, on) => {
  const seen = engine(on)
  await $.session.start(start)

  const ran = await $.command.run(run('dark #123'))
  expect(seen.sets).toEqual([{ key: 'background-color.darkBackground', value: '#112233' }])
  expect(seen.themes.length).toBe(2)
  expect(JSON.stringify(ran)).toContain('#112233')

  const bad = await $.command.run(run('light nope'))
  expect(seen.sets.length).toBe(1)
  expect(JSON.stringify(bad)).toContain("isn't a hex color")
})

test('the pane edits, picks presets and turns off on every surface', async ($, on) => {
  const seen = engine(on)
  await $.session.start(start)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.input({ key: 'light-hex', text: '#eef2f5' })
    await ui.press({ key: 'dark-Forest' })
    await ui.unmount()
  }
  expect(seen.sets).toContainEqual({ key: 'background-color.lightBackground', value: '#eef2f5' })
  expect(seen.sets).toContainEqual({ key: 'background-color.darkBackground', value: '#16201b' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'enabled' })
  expect(seen.sets).toContainEqual({ key: 'background-color.enabled', value: false })
  expect(seen.clears).toBe(1)
  expect(await ui.find({ type: 'Text', text: /app's own look/ })).toBeDefined()
  await ui.unmount()
})

test('a mode named with no color shows it and changes nothing', async ($, on) => {
  const seen = engine(on)
  await $.session.start(start)

  const ran = await $.command.run(run('dark'))
  expect(seen.sets.length).toBe(0)
  expect(JSON.stringify(ran)).toContain('Dark mode background is #1b1d22')
})

test('a load never toasts, even with a bad saved value', { options: { lightBackground: 'teal' } }, async ($, on) => {
  const seen = engine(on)
  await $.session.start({ ...start, surface: 'terminal' })
  expect(seen.toasts.length).toBe(0)
})

test('quick edits to both modes paint both new colors', async ($, on) => {
  const seen = engine(on)
  await $.session.start(start)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await Promise.all([ui.press({ key: 'light-Mist' }), ui.press({ key: 'dark-Forest' })])
  expect((await ui.find({ key: 'light-hex' }))?.props.value).toBe('#eef2f5')
  expect((await ui.find({ key: 'dark-hex' }))?.props.value).toBe('#16201b')
  expect(seen.themes.length).toBe(3)
  await ui.unmount()
})

test('a denied switch says why in the pane', async ($, on) => {
  engine(on, 'locked by your organization')
  await $.session.start(start)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'enabled' })
  expect(await ui.find({ type: 'Text', text: /locked by your organization/ })).toBeDefined()
  await ui.unmount()
})

test('green-screen paints green text on a dark green page', async ($, on) => {
  const seen = engine(on)
  await $.session.start(start)

  const ran = await $.command.run(run('green-screen'))
  expect(seen.sets).toContainEqual({ key: 'background-color.darkBackground', value: '#020c02' })
  expect(seen.sets).toContainEqual({ key: 'background-color.darkText', value: '#33ff33' })
  expect(JSON.stringify(ran)).toContain('#33ff33')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'dark-text' }))?.props.value).toBe('#33ff33')
  await ui.press({ key: 'dark-text-auto' })
  expect(seen.sets).toContainEqual({ key: 'background-color.darkText', value: '' })
  expect((await ui.find({ key: 'dark-text' }))?.props.value).toBe('')
  await ui.unmount()
})

test('a text color from the settings is used', { options: { darkText: '#FFB000' } }, async ($, on) => {
  engine(on)
  await $.session.start(start)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'dark-text' }))?.props.value).toBe('#ffb000')
  expect((await ui.find({ key: 'light-text' }))?.props.value).toBe('')
  await ui.unmount()
})
