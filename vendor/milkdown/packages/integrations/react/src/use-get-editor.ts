import { createContext, useContext, useEffect, useRef } from 'react'

import type { EditorInfoCtx } from './types'

export const editorInfoContext = createContext<EditorInfoCtx>(
  {} as EditorInfoCtx
)

export function useGetEditor() {
  const {
    dom,
    editor: editorRef,
    setLoading,
    editorFactory: getEditor,
    onError,
  } = useContext(editorInfoContext)
  const domRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const div = domRef.current

    if (!getEditor) return

    if (!div) return

    dom.current = div
    let disposed = false
    const reportCreationError = (error: unknown) => {
      if (!onError.current) {
        console.error(error)
        return
      }

      try {
        onError.current(error)
      } catch (callbackError) {
        console.error(callbackError)
      }
    }

    let editor
    try {
      editor = getEditor(div)
    } catch (error) {
      setLoading(false)
      reportCreationError(error)
      return
    }
    if (!editor) return

    setLoading(true)
    let creation: ReturnType<typeof editor.create>
    try {
      creation = editor.create()
    } catch (error) {
      setLoading(false)
      reportCreationError(error)
      return () => {
        void Promise.resolve()
          .then(() => editor.destroy())
          .catch(console.error)
      }
    }
    creation
      .then((editor) => {
        if (!disposed) {
          editorRef.current = editor
        }
      })
      .catch((error) => {
        if (disposed) return
        reportCreationError(error)
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false)
        }
      })

    return () => {
      disposed = true
      if (editorRef.current === editor) {
        editorRef.current = undefined
      }
      creation
        .catch(() => undefined)
        .then(() => editor.destroy())
        .catch(console.error)
    }
  }, [dom, editorRef, getEditor, onError, setLoading])

  return domRef
}
