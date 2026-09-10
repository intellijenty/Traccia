import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Bold, Italic, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (html: string) => void
}

export function SignatureEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[100px] text-sm px-3 py-2',
        spellcheck: 'false',
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? [])
        const imageItem = items.find(i => i.type.startsWith('image/'))
        if (!imageItem) return false
        event.preventDefault()
        const file = imageItem.getAsFile()
        if (!file) return false
        const reader = new FileReader()
        reader.onload = () => {
          const src = reader.result as string
          view.dispatch(view.state.tr.replaceSelectionWith(
            view.state.schema.nodes.image.create({ src })
          ))
        }
        reader.readAsDataURL(file)
        return true
      },
    },
  })

  // Sync external value changes (e.g. dialog reset)
  const prevValue = useRef(value)
  useEffect(() => {
    if (!editor || value === prevValue.current) return
    prevValue.current = value
    const { from, to } = editor.state.selection
    editor.commands.setContent(value, { emitUpdate: false })
    try { editor.commands.setTextSelection({ from, to }) } catch { /* ignore out-of-bounds */ }
  }, [editor, value])

  function handleLinkToggle() {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
    } else {
      const url = window.prompt('URL')
      if (url) editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const toolbarBtn = (active: boolean) =>
    cn(
      'flex h-6 w-6 items-center justify-center rounded transition-colors',
      active
        ? 'bg-foreground/10 text-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    )

  return (
    <div className="rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-input px-2 py-1.5">
        <button
          type="button"
          aria-label="Bold"
          className={toolbarBtn(editor?.isActive('bold') ?? false)}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          className={toolbarBtn(editor?.isActive('italic') ?? false)}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run() }}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          aria-label="Toggle link"
          className={toolbarBtn(editor?.isActive('link') ?? false)}
          onMouseDown={e => { e.preventDefault(); handleLinkToggle() }}
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Editor — tight paragraph spacing matches email rendering */}
      <style>{`.sig-editor p { margin: 0 0 2px 0 !important; } .sig-editor img { max-width: 100%; height: auto; }`}</style>
      <div className="sig-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
