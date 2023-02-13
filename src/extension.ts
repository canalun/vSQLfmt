import * as vscode from 'vscode'
import { Parser } from 'node-sql-parser'

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    'vSQLfmt.fmtInsertQueries',
    () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }
      const text = editor.document.getText()

      // keep comments
      const queriesAndComments = text
        .replace(/\n/g, '')
        .split(
          /(?=INSERT INTO)|(?=SELECT \* FROM)|(?=CREATE TABLE)|(?=DELETE FROM)|(?=UPDATE )|(?=ALTER TABLE)|(?=--)/g
        )
      const commentsMap: Map<number, string> = new Map()
      queriesAndComments.forEach((str, i) => {
        str.startsWith('--') && commentsMap.set(i, str)
      })

      // parse
      const parser = new Parser()
      const _asts = parser.astify(text)
      const asts = Array.isArray(_asts) ? _asts : [_asts]

      // Get char lengths and the max char length, of values of each column of each query.
      // In order to realize faster calculation, the max char length is calculated here, instead of applying max() to each array.
      const maxCharLengthOfEachColumnOfEachQuery: Array<Array<number>> = [] // [queryIndex][ColumnIndex]
      const charLengthsOfEachColumnOfEachQuery: Array<Array<Array<number>>> = [] // [queryIndex][ColumnIndex][Record(incl.ColumnNameReference)Index]
      for (let i = 0; i < asts.length; i++) {
        const query = asts[i]

        const charLengthsOfEachColumn: Array<Array<number>> = [] // [ColumnIndex][Record(incl.ColumnNameReference)Index]
        const maxLengthsOfEachColumn: Array<number> = [] // [ColumnIndex]

        // if query is other than INSERT, skip constructing the two arrays.
        if (query.type === 'insert' && query.columns) {
          for (
            let columnIndex = 0;
            columnIndex < query.columns.length;
            columnIndex++
          ) {
            const columnName = query.columns[columnIndex]
            const charLengthsOfColumn: Array<number> = [] // [Record(incl.ColumnNameReference)Index]
            charLengthsOfColumn.push(columnName.length)
            let maxLengthOfColumn = columnName.length
            query.values.forEach(
              (value: {
                type: 'expr_list'
                // FIXME: the below 'value' type is just rule of thumb and so uncertain.
                // this is because we've not found the clear type definition
                // used by florajs/sql-parser yet.
                // And this uncertainty can cause runtime error.
                // Currently, the former is chosen except for the case
                // in which back-quotation is used.
                value: Array<
                  | {
                      type: 'number' | 'bool' | 'null' | string
                      value: string
                    }
                  | { type: 'column_ref'; column: string; table: null | string } // when back-quotations are used as delimiter in value clauses
                  | { type: 'function'; name: string }
                >
              }) => {
                let charLength = 0
                const _value = value.value[columnIndex]
                switch (_value.type) {
                  case 'number':
                  case 'bool':
                  case 'null':
                    // most values have two delimiters(e.g. column name: back quotation; function: (); etc.).
                    // but these three kinds of values don't have delimiters.
                    // that's why magic number "2" is subtracted here.
                    charLength = String(_value.value).length - 2
                    break
                  case 'column_ref':
                    if (!('column' in _value)) {
                      vscode.window.showInformationMessage(
                        "failed: couldn't parse the file...!",
                        {
                          modal: true,
                        }
                      )
                      return
                    }
                    charLength = String(_value.column).length
                    break
                  case 'function':
                    if (!('name' in _value)) {
                      vscode.window.showInformationMessage(
                        "failed: couldn't parse the file...!",
                        {
                          modal: true,
                        }
                      )
                      return
                    }
                    charLength = String(_value.name).length
                    break
                  default:
                    if (!('value' in _value)) {
                      vscode.window.showInformationMessage(
                        "failed: couldn't parse the file...!",
                        {
                          modal: true,
                        }
                      )
                      return
                    }
                    charLength = String(_value.value).length
                }
                charLengthsOfColumn.push(charLength)
                maxLengthOfColumn = Math.max(charLength, maxLengthOfColumn)
              }
            )
            charLengthsOfEachColumn.push(charLengthsOfColumn)
            maxLengthsOfEachColumn.push(maxLengthOfColumn)
          }
        }
        charLengthsOfEachColumnOfEachQuery.push(charLengthsOfEachColumn)
        maxCharLengthOfEachColumnOfEachQuery.push(maxLengthsOfEachColumn)
      }

      // format query
      const result: Array<string> = []
      const opt = {
        database: 'MySQL', // MySQL is the default database
      }
      const strIns = (str: string, idx: number, val: string) => {
        const res = str.slice(0, idx) + val + str.slice(idx)
        return res
      }
      for (let queryIndex = 0; queryIndex < asts.length; queryIndex++) {
        const query = asts[queryIndex]
        if (query.type === 'insert' && query.columns) {
          const _sqls = parser
            .sqlify(query, opt)
            .replace('` (', '`\n(')
            .replace(') VALUES (', ')\nVALUES\n(')
            .replace(/\), \(/g, ')\n(')
            .split('\n')
          _sqls[1] = _sqls[1].replace(/ /g, '') // remove space from clause of column names

          const sqls = _sqls.map((clause, index) => {
            if (!clause.startsWith('(')) {
              return clause
            }

            // breakpointFinders is a string set to find breaks in value/column-name clauses.
            // It now supports value types of Varchar, NULL, Boolean, Number, Function.
            const breakpointFinders = [
              '(("|\'|`|NULL|TRUE|FALSE|[0-9,-]|\\(\\)),("|\'|`|NULL|TRUE|FALSE|[0-9,-]|[a-zA-Z]*\\(\\)))',
              '(("|\'|`|NULL|TRUE|FALSE|[0-9,-]|\\(\\))\\))',
            ]
            const recordIndex = index > 1 ? index - 2 : index - 1 // consider clauses such as 'INSERT...', 'VALUES...'

            let searchStartPos = 0
            for (
              let columnNum = 0;
              columnNum <
              maxCharLengthOfEachColumnOfEachQuery[queryIndex].length;
              columnNum++
            ) {
              let graphemePos = 0
              let insertPos = 0
              if (
                columnNum !==
                maxCharLengthOfEachColumnOfEachQuery[queryIndex].length - 1
              ) {
                const re = new RegExp(breakpointFinders[0])
                graphemePos = clause.substring(searchStartPos).search(re)
                insertPos =
                  clause.substring(graphemePos + searchStartPos).search(',') +
                  graphemePos +
                  searchStartPos
              } else {
                const re = new RegExp(breakpointFinders[1])
                graphemePos = clause.substring(searchStartPos).search(re)
                insertPos =
                  clause.substring(graphemePos + searchStartPos).search('\\)') +
                  graphemePos +
                  searchStartPos
              }
              const diffOfCharLengthAgainstTheMax =
                maxCharLengthOfEachColumnOfEachQuery[queryIndex][columnNum] -
                charLengthsOfEachColumnOfEachQuery[queryIndex][columnNum][
                  recordIndex
                ]
              const spaceNumToBeAdded = Math.max(
                diffOfCharLengthAgainstTheMax,
                0
              )
              clause = strIns(clause, insertPos, ' '.repeat(spaceNumToBeAdded))
              searchStartPos = insertPos + 1 + spaceNumToBeAdded
            }
            return clause
          })

          // restructure the query
          let formattedQuery = sqls.shift()
          for (let index = 0; index < sqls.length; index++) {
            const sqlFragment = sqls[index] // sqls = ['(columns)','VALUES','(values1)','(values2)'...] i.e. the 0th element 'INSERT...' was removed by shift()
            let delimiter = '\n'
            if (index >= 3) {
              delimiter = ',\n' // must add colon after records
            }
            formattedQuery = [formattedQuery, sqlFragment].join(delimiter)
          }
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          formattedQuery = formattedQuery?.concat(';') as string

          result.push(formattedQuery)
        } else {
          // just add sqlified queries for queries other than 'INSERT'
          const _sqlifiedQuery = parser.sqlify(query)
          const sqlifiedQuery = _sqlifiedQuery.endsWith(';')
            ? _sqlifiedQuery
            : _sqlifiedQuery.concat(';') // the sqlified result sometimes does not have semi-colon at its end

          result.push(sqlifiedQuery)
        }
      }

      // insert comments
      const resultWithComments = [...Array(queriesAndComments.length)].map(
        (_, index) => {
          return commentsMap.get(index)
            ? commentsMap.get(index)
            : result.shift()
        }
      )

      // replace the entire file
      const firstLine = editor.document.lineAt(0)
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1)
      const textRange = new vscode.Range(
        firstLine.range.start,
        lastLine.range.end
      )
      editor.edit((editBuilder) => {
        editBuilder.replace(textRange, resultWithComments.join('\n\n'))
      })
    }
  )
  context.subscriptions.push(disposable)
}

// This method is called when your extension is deactivated
export function deactivate() {
  return
}
