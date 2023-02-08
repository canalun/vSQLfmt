
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import {AST, Parser} from 'node-sql-parser'

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sqlinter" is now active!')

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('sqlinter.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from sqlinter!')
	})

	context.subscriptions.push(disposable)

	let disposable2 = vscode.commands.registerCommand('sqlinter.lintSqlRecords', () => {
        let editor = vscode.window.activeTextEditor
        if (editor) {
            const doc = editor.document
            const text = doc.getText()
            const textWithoutBreakLine = text.replace(/\n/g, '')
            // rows = rows.map((row) => {
            //     row = row.slice(1).slice(0, -2)
            //         .replace(/\\"/g, '"')
            //         .replace(/(\\\\\$)/g, '$')
            //     return row
            // })
            // text = rows.join('\n')
            // editor.edit(edit => {
            //     edit.replace(cur_selection, text)
            // })
            // vscode.window.showInformationMessage('Strings is converted to source.')/\n/g, ''
			// console.log(textWithoutBreakLine)
			const insertQueries = textWithoutBreakLine.split(/(?=INSERT INTO )|(?=-- )/g).filter((str) => str.startsWith('INSERT INTO'))

			const parser = new Parser()
			const asts = insertQueries.map((insertQuery) => {
				return parser.astify(insertQuery) as AST
			})
			console.log(asts);


			let setOfMaxLengthForEachColumns: Array<Array<number>> = []
			asts.forEach((ast)=> {
				let setOfColumnNameAndValues:Array<Array<string>> = []
				if (ast.type !== 'insert') {return}
				ast.columns?.forEach((columnName, index) => {
					let columnNameAndValues:Array<string> = []
					columnNameAndValues.push(columnName)
					ast.values.forEach((value) => {
						columnNameAndValues.push(value.value[index])
					})
					setOfColumnNameAndValues.push(columnNameAndValues)
				})
				// setOfColumnNameAndValues に [[column1, value1, value2,...],[column2, value1, value2,...]...]ってなってる
				let maxLengthForEachColumns: Array<number> = []
				setOfColumnNameAndValues.forEach((columnNameAndValues) => {
					let maxLength = -1
					columnNameAndValues.forEach((nameOrValue) => {
						if (maxLength < nameOrValue.length) {
							maxLength = nameOrValue.length
						}
					})
					maxLengthForEachColumns.push(maxLength)
				})
				setOfMaxLengthForEachColumns.push(maxLengthForEachColumns)
			})
			// setOfMaxLengthForEachColumns は [[table1のcolumn1の最大文字数, table1のcolumn2の最大文字数...],[table2のcolumn1の最大文字数, table2のcolumn2の最大文字数...]...]ってなってる
			console.log(setOfMaxLengthForEachColumns);
        }
    })
    context.subscriptions.push(disposable2)
}

// This method is called when your extension is deactivated
export function deactivate() {}
