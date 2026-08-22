import { defaultValueCtx, Editor, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { render, screen, waitFor } from '@testing-library/react'
import React, { type FC } from 'react'
import { expect, test, vi } from 'vitest'

import { Milkdown, MilkdownProvider } from '../editor'
import { useEditor } from '../use-editor'

const TestEditor: FC = () => {
  useEditor((root) => {
    const milkdown = Editor.make()

    milkdown
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, '# Testing')
      })
      .use(commonmark)

    return milkdown
  })

  return <Milkdown />
}

const TestApp = () => {
  return (
    <MilkdownProvider>
      <TestEditor />
    </MilkdownProvider>
  )
}

test('should render milkdown', async () => {
  render(<TestApp />)

  await waitFor(() => {
    expect(screen.getByText('Testing')).toBeInTheDocument()
  })
})

test('reports editor creation failures to the provider', async () => {
  const failure = new Error('Editor creation failed')
  const onError = vi.fn()
  const FailingEditor: FC = () => {
    useEditor((root) => Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, '# Testing')
      })
      .use(commonmark)
      .use(() => () => {
        throw failure
      }))
    return <Milkdown />
  }

  render(
    <MilkdownProvider onError={onError}>
      <FailingEditor />
    </MilkdownProvider>
  )

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith(failure)
  }, { timeout: 5000 })
})

test('does not report an editor creation failure after unmount', async () => {
  let rejectCreation: ((error: Error) => void) | undefined
  const onError = vi.fn()
  const editor = {
    create: () => new Promise((_resolve, reject) => {
      rejectCreation = reject
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  }
  const FailingEditor: FC = () => {
    useEditor(() => editor as unknown as Editor)
    return <Milkdown />
  }

  const { unmount } = render(
    <MilkdownProvider onError={onError}>
      <FailingEditor />
    </MilkdownProvider>
  )

  await waitFor(() => {
    expect(rejectCreation).toBeTypeOf('function')
  })
  unmount()
  rejectCreation?.(new Error('Late editor creation failure'))
  await Promise.resolve()
  await Promise.resolve()

  expect(onError).not.toHaveBeenCalled()
  expect(editor.destroy).toHaveBeenCalledOnce()
})

test('reports a pending creation failure to the callback that started it', async () => {
  let rejectCreation: ((error: Error) => void) | undefined
  const firstOnError = vi.fn()
  const nextOnError = vi.fn()
  const editor = {
    create: () => new Promise((_resolve, reject) => {
      rejectCreation = reject
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  }
  const FailingEditor: FC = () => {
    useEditor(() => editor as unknown as Editor)
    return <Milkdown />
  }

  const { rerender } = render(
    <MilkdownProvider onError={firstOnError}>
      <FailingEditor />
    </MilkdownProvider>
  )

  await waitFor(() => {
    expect(rejectCreation).toBeTypeOf('function')
  })
  rerender(
    <MilkdownProvider onError={nextOnError}>
      <FailingEditor />
    </MilkdownProvider>
  )
  const failure = new Error('Pending editor creation failed')
  rejectCreation?.(failure)

  await waitFor(() => {
    expect(firstOnError).toHaveBeenCalledWith(failure)
  })
  expect(nextOnError).not.toHaveBeenCalled()
})

test('waits for pending creation before destroying an unmounted editor', async () => {
  let resolveCreation: ((editor: Editor) => void) | undefined
  const editor = {
    create: () => new Promise<Editor>((resolve) => {
      resolveCreation = resolve
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  }
  const PendingEditor: FC = () => {
    useEditor(() => editor as unknown as Editor)
    return <Milkdown />
  }

  const { unmount } = render(
    <MilkdownProvider>
      <PendingEditor />
    </MilkdownProvider>
  )

  await waitFor(() => {
    expect(resolveCreation).toBeTypeOf('function')
  })
  unmount()

  expect(editor.destroy).not.toHaveBeenCalled()

  resolveCreation?.(editor as unknown as Editor)
  await waitFor(() => {
    expect(editor.destroy).toHaveBeenCalledOnce()
  })
})

test('reports editor factory failures to the provider', async () => {
  const failure = new Error('Editor factory failed')
  const onError = vi.fn()
  const FailingEditor: FC = () => {
    useEditor(() => {
      throw failure
    })
    return <Milkdown />
  }

  render(
    <MilkdownProvider onError={onError}>
      <FailingEditor />
    </MilkdownProvider>
  )

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith(failure)
  })
})

test('contains errors thrown by the provider error callback', async () => {
  const creationFailure = new Error('Editor creation failed')
  const callbackFailure = new Error('Provider error callback failed')
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const FailingEditor: FC = () => {
    useEditor(() => ({
      create: () => Promise.reject(creationFailure),
      destroy: vi.fn().mockResolvedValue(undefined),
    }) as unknown as Editor)
    return <Milkdown />
  }

  render(
    <MilkdownProvider onError={() => {
      throw callbackFailure
    }}>
      <FailingEditor />
    </MilkdownProvider>
  )

  await waitFor(() => {
    expect(consoleError).toHaveBeenCalledWith(callbackFailure)
  })
  consoleError.mockRestore()
})

test('reports synchronous create failures to the provider', async () => {
  const failure = new Error('Editor create threw synchronously')
  const onError = vi.fn()
  const editor = {
    create: () => {
      throw failure
    },
    destroy: vi.fn().mockResolvedValue(undefined),
  }
  const FailingEditor: FC = () => {
    useEditor(() => editor as unknown as Editor)
    return <Milkdown />
  }

  render(
    <MilkdownProvider onError={onError}>
      <FailingEditor />
    </MilkdownProvider>
  )

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith(failure)
  })
})
