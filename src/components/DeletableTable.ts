import { Table, TableView } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

class DeletableTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes: Record<string, unknown>,
    getPos: () => number | undefined,
  ) {
    super(node, cellMinWidth, view, HTMLAttributes)
    this.dom.classList.add('memo-table-wrap')

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'memo-table-remove'
    removeButton.title = '표 삭제'
    removeButton.setAttribute('aria-label', '표 삭제')
    removeButton.contentEditable = 'false'
    removeButton.textContent = '×'
    removeButton.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    removeButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const position = getPos()
      if (typeof position !== 'number') return
      view.dispatch(view.state.tr.delete(position, position + this.node.nodeSize))
      view.focus()
    })
    this.dom.appendChild(removeButton)
  }
}

export const DeletableTable = Table.extend({
  addNodeView() {
    return ({ node, view, getPos, HTMLAttributes }) =>
      new DeletableTableView(
        node,
        this.options.cellMinWidth,
        view,
        { ...this.options.HTMLAttributes, ...HTMLAttributes },
        getPos,
      )
  },
}).configure({
  resizable: false,
})
