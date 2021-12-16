/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

import type {
  OutlineEditor,
  RootNode,
  CommandListenerEditorPriority,
  TextFormatType,
  ElementFormatType,
} from 'outline';
import type {InputEvents} from 'outline-react/useOutlineEditorEvents';

import {$log, $getSelection, $getRoot, $isElementNode} from 'outline';
import useOutlineEditorEvents from '../useOutlineEditorEvents';
import {HeadingNode} from 'outline/HeadingNode';
import {ListNode} from 'outline/ListNode';
import {QuoteNode} from 'outline/QuoteNode';
import {CodeNode} from 'outline/CodeNode';
import {ParagraphNode} from 'outline/ParagraphNode';
import {ListItemNode} from 'outline/ListItemNode';
import {$createParagraphNode} from 'outline/ParagraphNode';
import {CAN_USE_BEFORE_INPUT} from 'shared/environment';
import useOutlineDragonSupport from './useOutlineDragonSupport';
import {
  onSelectionChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onCutForRichText,
  onCopyForRichText,
  onBeforeInput,
  onPasteForRichText,
  onDropPolyfill,
  onDragStartPolyfill,
  $onTextMutation,
  onInput,
  onClick,
  $shouldOverrideDefaultCharacterSelection,
} from 'outline/events';
import {$moveCharacter} from 'outline/selection';
import useLayoutEffect from 'shared/useLayoutEffect';
import withSubscriptions from 'outline-react/withSubscriptions';

const EditorPriority: CommandListenerEditorPriority = 0;

const events: InputEvents = [
  ['selectionchange', onSelectionChange],
  ['keydown', onKeyDown],
  ['compositionstart', onCompositionStart],
  ['compositionend', onCompositionEnd],
  ['cut', onCutForRichText],
  ['copy', onCopyForRichText],
  ['dragstart', onDragStartPolyfill],
  ['paste', onPasteForRichText],
  ['input', onInput],
  ['click', onClick],
];

if (CAN_USE_BEFORE_INPUT) {
  events.push(['beforeinput', onBeforeInput]);
} else {
  events.push(['drop', onDropPolyfill]);
}

function shouldSelectParagraph(editor: OutlineEditor): boolean {
  const activeElement = document.activeElement;
  return (
    $getSelection() !== null ||
    (activeElement !== null && activeElement === editor.getRootElement())
  );
}

function initParagraph(root: RootNode, editor: OutlineEditor): void {
  const paragraph = $createParagraphNode();
  root.append(paragraph);
  if (shouldSelectParagraph(editor)) {
    paragraph.select();
  }
}

export function initEditor(editor: OutlineEditor): void {
  editor.update(() => {
    $log('initEditor');
    const root = $getRoot();
    const firstChild = root.getFirstChild();
    if (firstChild === null) {
      initParagraph(root, editor);
    }
  });
}

function clearEditor(
  editor: OutlineEditor,
  callbackFn?: (callbackFn?: () => void) => void,
): void {
  editor.update(
    () => {
      $log('clearEditor');
      const root = $getRoot();
      root.clear();
      initParagraph(root, editor);
    },
    {
      onUpdate: callbackFn,
    },
  );
}

export function useRichTextSetup(
  editor: OutlineEditor,
  init: boolean,
): (
  editor: OutlineEditor,
  callbackFn?: (callbackFn?: () => void) => void,
) => void {
  useLayoutEffect(() => {
    const removeSubscriptions = withSubscriptions(
      editor.registerNodes([
        HeadingNode,
        ListNode,
        QuoteNode,
        CodeNode,
        ParagraphNode,
        ListItemNode,
      ]),
      editor.addListener('textmutation', $onTextMutation),
      editor.addListener(
        'command',
        (type, payload): boolean => {
          const selection = $getSelection();
          if (selection === null) {
            return false;
          }
          switch (type) {
            case 'deleteCharacter': {
              const isBackward: boolean = payload;
              selection.deleteCharacter(isBackward);
              return true;
            }
            case 'deleteWord': {
              const isBackward: boolean = payload;
              selection.deleteWord(isBackward);
              return true;
            }
            case 'deleteLine': {
              const isBackward: boolean = payload;
              selection.deleteLine(isBackward);
              return true;
            }
            case 'insertText':
              const text: string = payload;
              selection.insertText(text);
              return true;
            case 'removeText':
              selection.removeText();
              return true;
            case 'formatText': {
              const format: TextFormatType = payload;
              selection.formatText(format);
              return true;
            }
            case 'formatElement': {
              const format: ElementFormatType = payload;
              const node = selection.anchor.getNode();
              const element = $isElementNode(node)
                ? node
                : node.getParentOrThrow();
              element.setFormat(format);
              return true;
            }
            case 'insertLineBreak':
              const selectStart: boolean = payload;
              selection.insertLineBreak(selectStart);
              return true;
            case 'insertParagraph':
              selection.insertParagraph();
              return true;
            case 'indentContent': {
              // Handle code blocks
              const anchor = selection.anchor;
              const parentBlock =
                anchor.type === 'element'
                  ? anchor.getNode()
                  : anchor.getNode().getParentOrThrow();
              if (parentBlock.canInsertTab()) {
                editor.execCommand('insertText', '\t');
              } else {
                if (parentBlock.getIndent() !== 10) {
                  parentBlock.setIndent(parentBlock.getIndent() + 1);
                }
              }
              return true;
            }
            case 'outdentContent': {
              // Handle code blocks
              const anchor = selection.anchor;
              const anchorNode = anchor.getNode();
              const parentBlock =
                anchor.type === 'element'
                  ? anchor.getNode()
                  : anchor.getNode().getParentOrThrow();
              if (parentBlock.canInsertTab()) {
                const textContent = anchorNode.getTextContent();
                const character = textContent[anchor.offset - 1];
                if (character === '\t') {
                  editor.execCommand('deleteCharacter', true);
                }
              } else {
                if (parentBlock.getIndent() !== 0) {
                  parentBlock.setIndent(parentBlock.getIndent() - 1);
                }
              }
              return true;
            }
            case 'keyArrowLeft': {
              const event: KeyboardEvent = payload;
              const isHoldingShift = event.shiftKey;
              if ($shouldOverrideDefaultCharacterSelection(selection, true)) {
                event.preventDefault();
                $moveCharacter(selection, isHoldingShift, true);
                return true;
              }
              return false;
            }
            case 'keyArrowRight': {
              const event: KeyboardEvent = payload;
              const isHoldingShift = event.shiftKey;
              if ($shouldOverrideDefaultCharacterSelection(selection, false)) {
                event.preventDefault();
                $moveCharacter(selection, isHoldingShift, false);
                return true;
              }
              return false;
            }
            case 'keyBackspace': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              return editor.execCommand('deleteCharacter', true);
            }
            case 'keyDelete': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              return editor.execCommand('deleteCharacter', false);
            }
            case 'keyEnter': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              if (event.shiftKey) {
                return editor.execCommand('insertLineBreak');
              }
              return editor.execCommand('insertParagraph');
            }
            case 'keyTab': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              return editor.execCommand(
                event.shiftKey ? 'outdentContent' : 'indentContent',
              );
            }
          }
          return false;
        },
        EditorPriority,
      ),
    );

    if (init) {
      initEditor(editor);
    }

    return removeSubscriptions;
  }, [editor, init]);

  useOutlineEditorEvents(events, editor);
  useOutlineDragonSupport(editor);

  return clearEditor;
}
