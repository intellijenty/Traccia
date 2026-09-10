import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ── Color palettes ─────────────────────────────────────────────────────────

const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Dark Gray', value: '#374151' },
  { label: 'Green', value: '#00FF00' },
  { label: 'Yellow', value: '#FFFF00' },
  { label: 'Red', value: '#FF0000' },
  { label: 'Blue', value: '#0000FF' },
  { label: 'Orange', value: '#FFA500' },
  { label: 'Purple', value: '#800080' },
]

const HIGHLIGHT_COLORS = [
  { label: 'None', value: null },
  { label: 'Dark Gray', value: '#374151' },
  { label: 'Green', value: '#00FF00' },
  { label: 'Yellow', value: '#FFFF00' },
  { label: 'Red', value: '#FF0000' },
  { label: 'Blue', value: '#0000FF' },
  { label: 'Orange', value: '#FFA500' },
  { label: 'Purple', value: '#800080' },
]

// ── Color picker dropdown ───────────────────────────────────────────────────

function ColorDropdown({
  colors,
  activeColor,
  onSelect,
  indicator,
  tooltip,
}: {
  colors: { label: string; value: string | null }[]
  activeColor: string | null
  onSelect: (color: string | null) => void
  indicator: React.ReactNode
  tooltip: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <Tooltip>
      <div ref={ref} className="relative">
        <TooltipTrigger asChild>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
            className={cn(
              'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm font-medium transition-colors',
              open
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            )}
          >
            {indicator}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 flex flex-wrap gap-1 rounded-lg border border-border bg-background p-2 shadow-md w-[156px]">
            {colors.map(c => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onMouseDown={e => { e.preventDefault(); onSelect(c.value); setOpen(false) }}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded border transition-all hover:scale-110',
                  activeColor === c.value ? 'ring-2 ring-ring ring-offset-1' : 'border-border/50',
                  !c.value && 'border-dashed',
                )}
                style={c.value ? { backgroundColor: c.value } : {}}
              >
                {!c.value && <span className="text-[9px] text-muted-foreground">✕</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Tooltip>
  )
}

// ── Toolbar button ──────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  active,
  disabled,
  tooltip,
  children,
}: {
  onClick: () => void
  active: boolean
  disabled?: boolean
  tooltip: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={e => { e.preventDefault(); onClick() }}
          className={cn(
            'flex h-7 min-w-7 items-center justify-center rounded px-2 text-sm font-medium transition-colors disabled:opacity-30 disabled:pointer-events-none',
            active
              ? 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function Divider() {
  return <div className="mx-1.5 h-4 w-px bg-border" />
}

// ── Rich Editor ─────────────────────────────────────────────────────────────

export interface RichEditorHandle {
  setContent: (html: string) => void
  getHtml: () => string
  getText: () => string
}

export const RichEditor = forwardRef<RichEditorHandle, object>(function RichEditor(_, ref) {
  // Force re-render on every transaction so active states stay in sync
  const [, tick] = useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'outline-none' },
    },
    onTransaction: () => tick(n => n + 1),
    onSelectionUpdate: () => tick(n => n + 1),
  })

  useImperativeHandle(ref, () => ({
    setContent: (html: string) => editor?.commands.setContent(html, {}),
    getHtml: () => editor?.getHTML() ?? '',
    getText: () => editor?.getText() ?? '',
  }), [editor])

  if (!editor) return null

  const currentColor = editor.getAttributes('textStyle').color ?? null
  const currentHighlight = editor.getAttributes('highlight').color ?? null

  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex h-full flex-col">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-4 py-2">

          {/* Text formatting */}
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            tooltip="Bold"
          >
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            tooltip="Italic"
          >
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            tooltip="Strikethrough"
          >
            <span className="line-through">S</span>
          </ToolbarBtn>

          <Divider />

          {/* Font color */}
          <ColorDropdown
            colors={TEXT_COLORS}
            activeColor={currentColor}
            onSelect={color =>
              color
                ? editor.chain().focus().setColor(color).run()
                : editor.chain().focus().unsetColor().run()
            }
            indicator={
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-bold" style={currentColor ? { color: currentColor } : {}}>A</span>
                <span
                  className="h-0.5 w-3.5 rounded-full"
                  style={{ backgroundColor: currentColor ?? 'currentColor', opacity: currentColor ? 1 : 0.4 }}
                />
              </span>
            }
            tooltip="Font Color"
          />

          {/* Highlight */}
          <ColorDropdown
            colors={HIGHLIGHT_COLORS}
            activeColor={currentHighlight}
            onSelect={color =>
              color
                ? editor.chain().focus().toggleHighlight({ color }).run()
                : editor.chain().focus().unsetHighlight().run()
            }
            indicator={
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-bold">A</span>
                <span
                  className="h-1 w-3.5 rounded-sm"
                  style={{ backgroundColor: currentHighlight ?? '#fef08a', opacity: currentHighlight ? 1 : 0.3 }}
                />
              </span>
            }
            tooltip="Text Highlight"
          />

          <Divider />

          {/* Lists */}
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            tooltip="Bullet List"
          >
            ≡
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            tooltip="Numbered List"
          >
            1.
          </ToolbarBtn>

          <Divider />

          {/* Block */}
          <ToolbarBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            tooltip="Heading"
          >
            H
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            active={false}
            tooltip="Divider"
          >
            —
          </ToolbarBtn>

          <Divider />

          {/* Undo / Redo */}
          <ToolbarBtn
            onClick={() => editor.chain().focus().undo().run()}
            active={false}
            disabled={!editor.can().undo()}
            tooltip="Undo"
          >
            ↩
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().redo().run()}
            active={false}
            disabled={!editor.can().redo()}
            tooltip="Redo"
          >
            ↪
          </ToolbarBtn>
        </div>

        {/* Editor content */}
        <div
          className={[
            'flex-1 overflow-y-auto px-6 py-5 no-scrollbar',
            '[&_.ProseMirror]:text-[15px] [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-foreground [&_.ProseMirror]:min-h-40 [&_.ProseMirror]:outline-none',
            '[&_.ProseMirror_p]:my-1.5',
            '[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5',
            '[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5',
            '[&_.ProseMirror_p+ul]:mt-0 [&_.ProseMirror_p+ol]:mt-0',
            '[&_.ProseMirror_li]:my-1',
            '[&_.ProseMirror_li_ul]:my-1 [&_.ProseMirror_li_ul]:list-[circle]',
            '[&_.ProseMirror_div_p]:my-0.5',
            '[&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:my-3',
            '[&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-border',
            '[&_.ProseMirror_strong]:font-semibold',
            '[&_.ProseMirror_mark]:rounded-sm [&_.ProseMirror_mark]:px-0.5',
            '[&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:h-auto',
          ].join(' ')}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </TooltipProvider>
  )
})
