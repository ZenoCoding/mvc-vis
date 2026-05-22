import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import {
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  Home,
  Keyboard,
  Menu,
  Minus,
  MoreVertical,
  Plus,
  Redo2,
  Save,
  Settings,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Undo2,
  Wrench,
} from 'lucide-react'
import './App.css'
import { CalcScene } from './CalcScene'
import {
  compileRows,
  computeProbe,
  defaultProbe,
  defaultRows,
  defaultSettings,
  detectExpressionType,
  formatNumber,
} from './mathEngine'
import type { Bounds3, ExpressionRow, GraphSettings, ProbeState } from './types'

const STORAGE_KEY = 'calc3d-state-v1'
const colorPalette = ['#2f6edb', '#cf2c2c', '#57a33a', '#ff7b1a', '#8247d8', '#8a6045', '#111111']

interface PersistedState {
  rows: ExpressionRow[]
  settings: GraphSettings
  probe: ProbeState
}

const keypadRows = [
  ['(', ')', '|a|', ',', '<', '>', '<=', '7', '8', '9', '/', 'x', 'y', 'z', 'back'],
  ['d/dx', 'square', 'sqrt', '^', '!', '=', '4', '5', '6', '*', 'a^2', 'a^b', 'abs', 'inf'],
  ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', '1', '2', '3', '-', '(', ')'],
  ['SHIFT', '{', '}', '[', ']', '%', 'deg', '0', '.', '_', '+', 'enter'],
]

class CalcErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean; message: string }> {
  state = { crashed: false, message: '' }

  static getDerivedStateFromError(cause: Error) {
    return { crashed: true, message: cause.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Calc3D crashed', error, info)
  }

  reset = () => {
    window.localStorage.removeItem(STORAGE_KEY)
    window.location.reload()
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <main className="crash-screen">
        <section>
          <h1>Calc3D recovered from a graph error</h1>
          <p>{this.state.message || 'The saved graph state could not be rendered.'}</p>
          <button type="button" onClick={this.reset}>Reset graph</button>
        </section>
      </main>
    )
  }
}

function App() {
  const initial = loadState()
  const [rows, setRows] = useState<ExpressionRow[]>(initial.rows)
  const [settings, setSettings] = useState<GraphSettings>(initial.settings)
  const [probe, setProbe] = useState<ProbeState>(initial.probe)
  const [draftExpression, setDraftExpression] = useState('')
  const [activeRowId, setActiveRowId] = useState<string | undefined>(rows[0]?.id)
  const [keypadOpen, setKeypadOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [cameraResetKey, setCameraResetKey] = useState(0)

  const graph = useMemo(() => compileRows(rows), [rows])
  const probeResult = useMemo(
    () => computeProbe(graph.surfaces[0], graph.vectors[0], probe, settings),
    [graph, probe, settings],
  )

  useEffect(() => {
    const state: PersistedState = { rows, settings, probe }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [rows, settings, probe])

  const updateRow = (id: string, patch: Partial<ExpressionRow>) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const expression = patch.expression ?? row.expression
        return {
          ...row,
          ...patch,
          type: detectExpressionType(expression),
        }
      }),
    )
  }

  const addBlankRow = () => {
    const nextRow: ExpressionRow = {
      id: `row-${Date.now()}`,
      type: 'surface',
      expression: '',
      color: nextColor(rows.length),
      enabled: true,
    }
    setRows((current) => [...current, nextRow])
    setActiveRowId(nextRow.id)
  }

  const addExpression = () => {
    const expression = draftExpression.trim()
    if (!expression) return
    const nextRow: ExpressionRow = {
      id: `row-${Date.now()}`,
      type: detectExpressionType(expression),
      expression,
      color: nextColor(rows.length),
      enabled: true,
    }
    setRows((current) => [...current, nextRow])
    setActiveRowId(nextRow.id)
    setDraftExpression('')
  }

  const deleteRow = (id: string) => {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id)
      if (index < 0) return current
      if (current.length === 1) {
        const blank = createBlankRow(0)
        setActiveRowId(blank.id)
        return [blank]
      }
      const next = current.filter((row) => row.id !== id)
      setActiveRowId(next[Math.min(index, next.length - 1)]?.id)
      return next
    })
  }

  const duplicateRow = (id: string) => {
    setRows((current) => {
      const rowIndex = current.findIndex((row) => row.id === id)
      if (rowIndex < 0) return current
      const source = current[rowIndex]
      const copy: ExpressionRow = {
        ...source,
        id: `row-${Date.now()}`,
        color: nextColor(current.length),
      }
      const next = [...current]
      next.splice(rowIndex + 1, 0, copy)
      setActiveRowId(copy.id)
      return next
    })
  }

  const cycleRowColor = (id: string) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const index = colorPalette.indexOf(row.color)
        return { ...row, color: colorPalette[(index + 1) % colorPalette.length] }
      }),
    )
  }

  const insertToken = (token: string) => {
    if (token === 'back') {
      if (activeRowId) {
        const current = rows.find((row) => row.id === activeRowId)?.expression ?? ''
        updateRow(activeRowId, { expression: current.slice(0, -1) })
      } else {
        setDraftExpression((value) => value.slice(0, -1))
      }
      return
    }
    if (token === 'enter') {
      addExpression()
      return
    }
    const text = tokenForKey(token)
    if (!text) return
    if (activeRowId) {
      updateRow(activeRowId, {
        expression: `${rows.find((row) => row.id === activeRowId)?.expression ?? ''}${text}`,
      })
    } else {
      setDraftExpression((value) => `${value}${text}`)
    }
  }

  const updateBounds = (key: keyof Bounds3, value: number) => {
    setSettings((current) => ({
      ...current,
      bounds: {
        ...current.bounds,
        [key]: value,
      },
    }))
  }

  return (
    <main className="calc-app">
      <TopBar
        keypadOpen={keypadOpen}
        settingsOpen={settingsOpen}
        onToggleKeypad={() => setKeypadOpen((value) => !value)}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
      />
      <section className={`workspace ${keypadOpen ? 'with-keypad' : ''}`}>
        <ExpressionPanel
          rows={rows}
          activeRowId={activeRowId}
          errors={graph.errors}
          draftExpression={draftExpression}
          onDraftChange={setDraftExpression}
          onDraftSubmit={addExpression}
          onAddBlankRow={addBlankRow}
          onActiveRow={setActiveRowId}
          onUpdateRow={updateRow}
          onDeleteRow={deleteRow}
          onDuplicateRow={duplicateRow}
          onCycleRowColor={cycleRowColor}
        />
        <section className="viewport-shell">
          <div className="viewport-actions" aria-label="3D view controls">
            <button type="button" className="icon-button tall" title="Graph tools">
              <Wrench size={20} />
            </button>
            <button type="button" className="icon-button tall" title="Zoom in">
              <Plus size={22} />
            </button>
            <button type="button" className="icon-button tall" title="Zoom out">
              <Minus size={22} />
            </button>
            <button
              type="button"
              className="icon-button tall"
              title="Reset view"
              onClick={() => setCameraResetKey((value) => value + 1)}
            >
              <Home size={19} />
            </button>
            <button type="button" className="icon-button tall" title="3D box">
              <Box size={20} />
            </button>
          </div>
          <CalcScene
            graph={graph}
            settings={settings}
            probe={probe}
            onProbeChange={setProbe}
            cameraResetKey={cameraResetKey}
          />
          <ProbeReadout
            result={probeResult}
            settings={settings}
            probe={probe}
            onProbeChange={setProbe}
            onSettingsChange={setSettings}
          />
        </section>
        {settingsOpen ? (
          <SettingsPanel settings={settings} onSettingsChange={setSettings} onBoundsChange={updateBounds} />
        ) : null}
      </section>
      {keypadOpen ? <Keypad onPress={insertToken} /> : null}
    </main>
  )
}

function TopBar({
  keypadOpen,
  settingsOpen,
  onToggleKeypad,
  onToggleSettings,
}: {
  keypadOpen: boolean
  settingsOpen: boolean
  onToggleKeypad: () => void
  onToggleSettings: () => void
}) {
  return (
    <header className="top-bar">
      <div className="top-left">
        <button type="button" className="top-icon" title="Menu">
          <Menu size={23} />
        </button>
        <div className="brand">Calc3D</div>
        <div className="divider" />
        <button type="button" className="graph-title">
          Untitled Graph <ChevronDown size={16} />
        </button>
        <button type="button" className="save-button">
          <Save size={16} /> Save
        </button>
      </div>
      <div className="top-center">
        <button type="button" className="top-icon" title="Undo">
          <Undo2 size={20} />
        </button>
        <button type="button" className="top-icon" title="Redo">
          <Redo2 size={20} />
        </button>
        <button type="button" className={`top-icon ${settingsOpen ? 'active' : ''}`} title="Settings" onClick={onToggleSettings}>
          <Settings size={21} />
        </button>
      </div>
      <div className="top-right">
        <button type="button" className="top-icon" title="Help">
          <CircleHelp size={21} />
        </button>
        <button type="button" className={`top-icon ${keypadOpen ? 'active' : ''}`} title="Keypad" onClick={onToggleKeypad}>
          <Keyboard size={22} />
        </button>
        <button type="button" className="top-icon" title="More">
          <ChevronDown size={20} />
        </button>
      </div>
    </header>
  )
}

function ExpressionPanel({
  rows,
  activeRowId,
  errors,
  draftExpression,
  onDraftChange,
  onDraftSubmit,
  onAddBlankRow,
  onActiveRow,
  onUpdateRow,
  onDeleteRow,
  onDuplicateRow,
  onCycleRowColor,
}: {
  rows: ExpressionRow[]
  activeRowId?: string
  errors: { rowId: string; message: string }[]
  draftExpression: string
  onDraftChange: (value: string) => void
  onDraftSubmit: () => void
  onAddBlankRow: () => void
  onActiveRow: (id: string | undefined) => void
  onUpdateRow: (id: string, patch: Partial<ExpressionRow>) => void
  onDeleteRow: (id: string) => void
  onDuplicateRow: (id: string) => void
  onCycleRowColor: (id: string) => void
}) {
  const errorMap = new Map(errors.map((error) => [error.rowId, error.message]))
  return (
    <aside className="expression-panel">
      <div className="expression-toolbar">
        <button type="button" className="add-button" onClick={onAddBlankRow} title="Add expression row">
          <Plus size={25} />
        </button>
        <button type="button" className="small-tool">
          <Undo2 size={20} />
        </button>
        <button type="button" className="small-tool disabled">
          <Redo2 size={20} />
        </button>
        <button type="button" className="small-tool">
          <Settings size={21} />
        </button>
        <button type="button" className="small-tool">
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="expression-list">
        {rows.map((row, index) => (
          <ExpressionItem
            key={row.id}
            row={row}
            index={index + 1}
            active={activeRowId === row.id}
            error={errorMap.get(row.id)}
            onActive={() => onActiveRow(row.id)}
            onUpdate={(patch) => onUpdateRow(row.id, patch)}
            onDelete={() => onDeleteRow(row.id)}
            onDuplicate={() => onDuplicateRow(row.id)}
            onCycleColor={() => onCycleRowColor(row.id)}
          />
        ))}
      </div>
      <div className="new-expression">
        <button type="button" className="new-expression-plus" onClick={onDraftSubmit}>
          <Plus size={23} />
        </button>
        <input
          value={draftExpression}
          placeholder="Add expression..."
          onFocus={() => onActiveRow(undefined)}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onDraftSubmit()
          }}
        />
        <Keyboard size={19} />
      </div>
    </aside>
  )
}

function ExpressionItem({
  row,
  index,
  active,
  error,
  onActive,
  onUpdate,
  onDelete,
  onDuplicate,
  onCycleColor,
}: {
  row: ExpressionRow
  index: number
  active: boolean
  error?: string
  onActive: () => void
  onUpdate: (patch: Partial<ExpressionRow>) => void
  onDelete: () => void
  onDuplicate: () => void
  onCycleColor: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inferredType = detectExpressionType(row.expression)
  const note = error

  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  return (
    <article className={`expression-item ${active ? 'active' : ''} ${error ? 'has-error' : ''}`}>
      <div className="row-gutter">
        <div className="row-number">{index}</div>
        <button
          type="button"
          className={`row-color ${row.enabled ? '' : 'off'} ${error ? 'error' : ''}`}
          style={{ '--row-color': row.color } as React.CSSProperties}
          onClick={() => onUpdate({ enabled: !row.enabled })}
          title={row.enabled ? 'Hide expression' : 'Show expression'}
        >
          {error ? <TriangleAlert size={16} /> : <GraphGlyph type={inferredType} enabled={row.enabled} />}
        </button>
      </div>
      <div className="row-main">
        <div className="row-input-line">
          {active ? (
            <input
              ref={inputRef}
              value={row.expression}
              autoFocus={row.expression === ''}
              spellCheck={false}
              onFocus={onActive}
              onChange={(event) => onUpdate({ expression: event.target.value })}
              onKeyDown={(event) => {
                if (event.key !== 'Delete' && event.key !== 'Backspace') return
                const input = event.currentTarget
                const wholeExpressionSelected =
                  input.selectionStart === 0 && input.selectionEnd === row.expression.length
                if (row.expression === '' || wholeExpressionSelected) {
                  event.preventDefault()
                  onDelete()
                }
              }}
            />
          ) : (
            <button type="button" className="expression-display" onClick={onActive}>
              <FormattedExpression expression={row.expression} />
            </button>
          )}
        </div>
        {note ? <div className={`row-note ${error ? 'error' : ''}`}>{note}</div> : null}
      </div>
      <div className="row-menu-wrap">
        <button
          type="button"
          className="row-action"
          title="Expression actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <MoreVertical size={20} />
        </button>
        {menuOpen ? (
          <div className="row-menu">
            <button type="button" onClick={() => { onDuplicate(); setMenuOpen(false) }}>
              <Copy size={15} /> Duplicate
            </button>
            <button type="button" onClick={() => { onCycleColor(); setMenuOpen(false) }}>
              <span className="menu-swatch" style={{ background: row.color }} /> Change color
            </button>
            <button type="button" onClick={() => { onUpdate({ enabled: !row.enabled }); setMenuOpen(false) }}>
              {row.enabled ? <EyeOff size={15} /> : <Eye size={15} />} {row.enabled ? 'Hide' : 'Show'}
            </button>
            <button type="button" className="danger" onClick={() => { onDelete(); setMenuOpen(false) }}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function FormattedExpression({ expression }: { expression: string }) {
  const parts = expression.split(/(\bF\b)/g)
  return (
    <>
      {parts.map((part, index) =>
        part === 'F' ? (
          <VectorSymbol key={`${part}-${index}`}>F</VectorSymbol>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  )
}

function GraphGlyph({ type, enabled }: { type: ReturnType<typeof detectExpressionType>; enabled: boolean }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 26 26',
    role: 'presentation',
    'aria-hidden': true,
    className: enabled ? 'graph-glyph' : 'graph-glyph muted',
  }

  if (type === 'curve') {
    return (
      <svg {...common}>
        <path d="M6 20.5V7" opacity=".74" />
        <path d="M6 20.5h13.5" opacity=".74" />
        <path d="M8.8 21c-1-4.1 1-6.7 4.4-6.7 4.3 0 5.6 3.5 1.6 4.5-4.2 1-6-3.1-2.2-5.9 2.3-1.7 5.2-2.1 7.8-.5" />
      </svg>
    )
  }

  if (type === 'vector') {
    return (
      <svg {...common}>
        <path d="M8.4 17.6l9.2-9.2" />
        <path d="M17.6 8.4l-3.6.9" />
        <path d="M17.6 8.4l-.9 3.6" />
        <path d="M9.6 9.6L5.4 5.4" />
        <path d="M5.4 5.4l3.3.6" />
        <path d="M5.4 5.4l.6 3.3" />
        <path d="M16.4 9.6l4.2-4.2" />
        <path d="M20.6 5.4l-.6 3.3" />
        <path d="M20.6 5.4l-3.3.6" />
        <path d="M9.6 16.4l-4.2 4.2" />
        <path d="M5.4 20.6l.6-3.3" />
        <path d="M5.4 20.6l3.3-.6" />
        <path d="M16.4 16.4l4.2 4.2" />
        <path d="M20.6 20.6l-3.3-.6" />
        <path d="M20.6 20.6l-.6-3.3" />
      </svg>
    )
  }

  if (type === 'gradient') {
    return (
      <svg {...common}>
        <ellipse cx="10.4" cy="16" rx="5.8" ry="3.5" />
        <ellipse cx="10.4" cy="16" rx="2.6" ry="1.5" />
        <path d="M11.2 15.2l8.6-8.6" />
        <path d="M19.8 6.6l-3.6.7" />
        <path d="M19.8 6.6l-.7 3.6" />
      </svg>
    )
  }

  if (type === 'divergence') {
    return (
      <svg {...common}>
        <circle cx="13" cy="13" r="2.2" />
        <path d="M13 5v4" />
        <path d="M13 17v4" />
        <path d="M5 13h4" />
        <path d="M17 13h4" />
        <path d="M7.2 7.2l2.8 2.8" />
        <path d="M16 16l2.8 2.8" />
        <path d="M18.8 7.2L16 10" />
        <path d="M10 16l-2.8 2.8" />
      </svg>
    )
  }

  if (type === 'curl') {
    return (
      <svg {...common}>
        <path d="M18.8 9.2a6.7 6.7 0 1 0 1 6.5" />
        <path d="M18.8 9.2l-4.1-.2" />
        <path d="M18.8 9.2l-.7-4" />
        <path d="M10.5 13.5a2.8 2.8 0 1 0 4.9-1.8" />
      </svg>
    )
  }

  if (type === 'plane') {
    return (
      <svg {...common}>
        <path d="M13 5v16" opacity=".6" strokeDasharray="3 2" />
        <path d="M5 13.2h16" opacity=".6" />
        <path d="M9.2 7.2l7.7-2.3v13.8L9.2 21z" />
      </svg>
    )
  }

  if (type === 'implicit') {
    return (
      <svg {...common}>
        <circle cx="13" cy="13" r="8" />
        <path d="M5.5 13c3.7-2 11.3-2 15 0" />
        <path d="M5.5 13c3.7 2 11.3 2 15 0" />
        <path d="M13 5c2.2 3.5 2.2 12.5 0 16" />
        <path d="M13 5c-2.2 3.5-2.2 12.5 0 16" />
      </svg>
    )
  }

  if (type === 'unresolved') {
    return (
      <svg {...common}>
        <path d="M13 6v8" />
        <path d="M13 18.5v.1" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M3.5 15.6c3.1-8.1 6.1-8.1 9.2 0s6.1 8.1 9.2 0" />
      <path d="M4.2 19.2c3.1-8.1 6.1-8.1 9.2 0s6.1 8.1 9.2 0" opacity=".45" />
    </svg>
  )
}

function SettingsPanel({
  settings,
  onSettingsChange,
  onBoundsChange,
}: {
  settings: GraphSettings
  onSettingsChange: React.Dispatch<React.SetStateAction<GraphSettings>>
  onBoundsChange: (key: keyof Bounds3, value: number) => void
}) {
  return (
    <aside className="settings-panel">
      <div className="settings-head">
        <button type="button" className="icon-button">
          <Box size={22} />
        </button>
        <input
          type="range"
          min={20}
          max={90}
          value={settings.perspective}
          onChange={(event) =>
            onSettingsChange((current) => ({ ...current, perspective: Number(event.target.value) }))
          }
        />
        <button type="button" className="icon-button">
          <SlidersHorizontal size={21} />
        </button>
      </div>
      <SettingsSection title="Bounds">
        <BoundRow label="x" minKey="xMin" maxKey="xMax" bounds={settings.bounds} onChange={onBoundsChange} />
        <BoundRow label="y" minKey="yMin" maxKey="yMax" bounds={settings.bounds} onChange={onBoundsChange} />
        <BoundRow label="z" minKey="zMin" maxKey="zMax" bounds={settings.bounds} onChange={onBoundsChange} />
      </SettingsSection>
      <SettingsSection title="Perspective">
        <div className="range-line">
          <input
            type="range"
            min={20}
            max={90}
            value={settings.perspective}
            onChange={(event) =>
              onSettingsChange((current) => ({ ...current, perspective: Number(event.target.value) }))
            }
          />
          <span>{settings.perspective}%</span>
        </div>
      </SettingsSection>
      <SettingsSection title="Axes & Grid">
        <div className="check-grid">
          <CheckLabel label="XY plane" checked={settings.showXY} onChange={(showXY) => onSettingsChange((current) => ({ ...current, showXY }))} />
          <CheckLabel label="YZ plane" checked={settings.showYZ} onChange={(showYZ) => onSettingsChange((current) => ({ ...current, showYZ }))} />
          <CheckLabel label="XZ plane" checked={settings.showXZ} onChange={(showXZ) => onSettingsChange((current) => ({ ...current, showXZ }))} />
          <CheckLabel label="Numbers" checked={settings.showNumbers} onChange={(showNumbers) => onSettingsChange((current) => ({ ...current, showNumbers }))} />
          <CheckLabel label="Labels" checked={settings.showLabels} onChange={(showLabels) => onSettingsChange((current) => ({ ...current, showLabels }))} />
        </div>
      </SettingsSection>
      <SettingsSection title="Translucent surfaces">
        <Toggle checked={settings.translucentSurfaces} onChange={(translucentSurfaces) => onSettingsChange((current) => ({ ...current, translucentSurfaces }))} />
      </SettingsSection>
      <SettingsSection title="Vector density">
        <div className="range-line">
          <input
            type="range"
            min={2}
            max={7}
            value={settings.vectorDensity}
            onChange={(event) =>
              onSettingsChange((current) => ({ ...current, vectorDensity: Number(event.target.value) }))
            }
          />
          <span>{settings.vectorDensity}</span>
        </div>
        <div className="segmented">
          <button
            type="button"
            className={settings.vectorMode === 'volume' ? 'selected' : ''}
            onClick={() => onSettingsChange((current) => ({ ...current, vectorMode: 'volume' }))}
          >
            Volume
          </button>
          <button
            type="button"
            className={settings.vectorMode === 'slice' ? 'selected' : ''}
            onClick={() => onSettingsChange((current) => ({ ...current, vectorMode: 'slice' }))}
          >
            Slice
          </button>
        </div>
      </SettingsSection>
    </aside>
  )
}

function BoundRow({
  label,
  minKey,
  maxKey,
  bounds,
  onChange,
}: {
  label: string
  minKey: keyof Bounds3
  maxKey: keyof Bounds3
  bounds: Bounds3
  onChange: (key: keyof Bounds3, value: number) => void
}) {
  return (
    <div className="bound-row">
      <span>{label}:</span>
      <input type="number" value={bounds[minKey]} onChange={(event) => onChange(minKey, Number(event.target.value))} />
      <span>to</span>
      <input type="number" value={bounds[maxKey]} onChange={(event) => onChange(maxKey, Number(event.target.value))} />
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function CheckLabel({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="check-label">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span />
    </button>
  )
}

function ProbeReadout({
  result,
  settings,
  probe,
  onProbeChange,
  onSettingsChange,
}: {
  result: ReturnType<typeof computeProbe>
  settings: GraphSettings
  probe: ProbeState
  onProbeChange: (probe: ProbeState) => void
  onSettingsChange: React.Dispatch<React.SetStateAction<GraphSettings>>
}) {
  if (!result) return null
  const xPct =
    ((probe.x - settings.bounds.xMin) / (settings.bounds.xMax - settings.bounds.xMin)) * 100
  const yPct =
    100 - ((probe.y - settings.bounds.yMin) / (settings.bounds.yMax - settings.bounds.yMin)) * 100

  return (
    <div className="probe-card">
      <div className="probe-title">Calculus probe</div>
      <div className="probe-grid">
        <span>p</span>
        <strong>
          ({formatNumber(result.point.x)}, {formatNumber(result.point.y)}, {formatNumber(result.point.z)})
        </strong>
        <span>grad f</span>
        <strong>
          ({formatNumber(result.fx)}, {formatNumber(result.fy)})
        </strong>
        <span>normal</span>
        <strong>
          ({formatNumber(result.normal.x)}, {formatNumber(result.normal.y)}, {formatNumber(result.normal.z)})
        </strong>
        <span>D_u f</span>
        <strong>{formatNumber(result.directionalDerivative)}</strong>
        <span>
          div <VectorSymbol>F</VectorSymbol>
        </span>
        <strong>{formatNumber(result.divergence)}</strong>
        <span>
          curl <VectorSymbol>F</VectorSymbol>
        </span>
        <strong>
          {result.curl
            ? `(${formatNumber(result.curl.x)}, ${formatNumber(result.curl.y)}, ${formatNumber(result.curl.z)})`
            : 'n/a'}
        </strong>
      </div>
      <div className="probe-controls">
        <label>
          x
          <input
            type="range"
            min={settings.bounds.xMin}
            max={settings.bounds.xMax}
            step={0.05}
            value={probe.x}
            onChange={(event) => onProbeChange({ ...probe, x: Number(event.target.value) })}
          />
        </label>
        <label>
          y
          <input
            type="range"
            min={settings.bounds.yMin}
            max={settings.bounds.yMax}
            step={0.05}
            value={probe.y}
            onChange={(event) => onProbeChange({ ...probe, y: Number(event.target.value) })}
          />
        </label>
        <label>
          direction
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={settings.directionAngle}
            onChange={(event) =>
              onSettingsChange((current) => ({ ...current, directionAngle: Number(event.target.value) }))
            }
          />
        </label>
      </div>
      <div className="trace-map" aria-label="2D domain trace plane">
        <div className="trace-axis x-axis" />
        <div className="trace-axis y-axis" />
        <div className="trace-dot" style={{ left: `${xPct}%`, top: `${yPct}%` }} />
      </div>
    </div>
  )
}

function VectorSymbol({ children }: { children: React.ReactNode }) {
  return <b className="math-vector">{children}</b>
}

function Keypad({ onPress }: { onPress: (token: string) => void }) {
  return (
    <footer className="keypad">
      <div className="keypad-tabs">
        <button type="button" className="active">main</button>
        <button type="button">abc</button>
        <button type="button">func</button>
        <button type="button">calc</button>
      </div>
      <div className="keypad-side">
        <button type="button">
          <Keyboard size={21} />
        </button>
        <button type="button">^</button>
      </div>
      <div className="keypad-keys">
        {keypadRows.flat().map((key, index) => (
          <button
            key={`${key}-${index}`}
            type="button"
            className={key === 'enter' ? 'enter-key' : ''}
            onClick={() => onPress(key)}
          >
            {displayKey(key)}
          </button>
        ))}
      </div>
    </footer>
  )
}

function loadState(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { rows: defaultRows, settings: defaultSettings, probe: defaultProbe }
    const parsed = JSON.parse(raw) as PersistedState
    return {
      rows: normalizeRows(parsed.rows),
      settings: { ...defaultSettings, ...parsed.settings, bounds: { ...defaultSettings.bounds, ...parsed.settings?.bounds } },
      probe: { ...defaultProbe, ...parsed.probe },
    }
  } catch {
    return { rows: defaultRows, settings: defaultSettings, probe: defaultProbe }
  }
}

function normalizeRows(value: unknown): ExpressionRow[] {
  if (!Array.isArray(value)) return defaultRows
  const rows = value.flatMap((candidate, index): ExpressionRow[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const row = candidate as Partial<ExpressionRow>
    const expression = typeof row.expression === 'string' ? row.expression : ''
    return [
      {
        id: typeof row.id === 'string' && row.id ? row.id : `row-${index}`,
        expression,
        type: detectExpressionType(expression),
        color: typeof row.color === 'string' ? row.color : nextColor(index),
        enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
      },
    ]
  })
  return rows.length > 0 ? rows : [createBlankRow(0)]
}

function createBlankRow(index: number): ExpressionRow {
  return {
    id: `row-${Date.now()}-${index}`,
    type: 'surface',
    expression: '',
    color: nextColor(index),
    enabled: true,
  }
}

function nextColor(index: number) {
  return colorPalette[index % colorPalette.length]
}

function displayKey(key: string) {
  if (key === 'back') return '<x'
  if (key === 'square') return 'a^2'
  if (key === 'sqrt') return 'sqrt'
  if (key === 'inf') return 'inf'
  if (key === 'deg') return 'deg'
  if (key === 'enter') return 'enter'
  return key
}

function tokenForKey(key: string) {
  if (key === 'back') return ''
  if (key === 'square') return '^2'
  if (key === 'sqrt') return 'sqrt('
  if (key === 'abs') return 'abs('
  if (key === 'a^2') return '^2'
  if (key === 'a^b') return '^'
  if (key === 'sin' || key === 'cos' || key === 'tan' || key === 'asin' || key === 'acos' || key === 'atan' || key === 'ln') {
    return `${key}(`
  }
  if (key === 'enter' || key === 'SHIFT' || key === 'deg') return ''
  return key
}

export default function AppRoot() {
  return (
    <CalcErrorBoundary>
      <App />
    </CalcErrorBoundary>
  )
}
