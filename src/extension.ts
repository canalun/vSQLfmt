import * as vscode from "vscode";
import { AST, Parser } from "node-sql-parser";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "sqlinter.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from sqlinter!");
    }
  );

  context.subscriptions.push(disposable);

  let disposable2 = vscode.commands.registerCommand(
    "sqlinter.lintSqlRecords",
    () => {
      let editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const doc = editor.document;
      const text = doc.getText();
      const textWithoutBreakLine = text.replace(/\n/g, "");

      const insertQueries = textWithoutBreakLine
        .split(/(?=INSERT INTO )|(?=-- )/g)
        .filter((str) => str.startsWith("INSERT INTO"));

      const parser = new Parser();
      const asts = insertQueries.map((insertQuery) => {
        return parser.astify(insertQuery) as AST;
      });

      const setOfMaxLengthForEachColumns: Array<Array<number>> = [];
      const setOfLengthForEachColumns: Array<Array<Array<number>>> = [];
      asts.forEach((ast) => {
        const setOfLengthOfColumnNameAndValues: Array<Array<number>> = [];
        if (ast.type !== "insert") {
          return;
        }
        ast.columns?.forEach((columnName, index) => {
          const lengthOfColumnNameAndValues: Array<number> = [];
          lengthOfColumnNameAndValues.push(columnName.length);
          ast.values.forEach(
            (value: {
              type: "expr_list";
              value: Array<{ type: "single_quote_string"; value: string }>;
            }) => {
              lengthOfColumnNameAndValues.push(value.value[index].value.length);
            }
          );
          setOfLengthOfColumnNameAndValues.push(lengthOfColumnNameAndValues);
        });
        // setOfLengthOfColumnNameAndValues に [[column1の長さ, value1の長さ, value2の長さ,...],[column2の長さ, value1の長さ, value2の長さ,...]...]ってなってる
        // これを追加
        setOfLengthForEachColumns.push(setOfLengthOfColumnNameAndValues);

        const maxLengthForEachColumns: Array<number> = [];
        setOfLengthOfColumnNameAndValues.forEach(
          (lengthOfColumnNameAndValues) => {
            let maxLength = -1;
            lengthOfColumnNameAndValues.forEach((lengthOfNameOrValue) => {
              if (maxLength < lengthOfNameOrValue) {
                maxLength = lengthOfNameOrValue;
              }
            });
            maxLengthForEachColumns.push(maxLength);
          }
        );
        setOfMaxLengthForEachColumns.push(maxLengthForEachColumns);
      });
      // setOfMaxLengthForEachColumns は [[table1のcolumn1の最大文字数, table1のcolumn2の最大文字数...],[table2のcolumn1の最大文字数, table2のcolumn2の最大文字数...]...]ってなってる
      // setOfLengthForEachColumns は [(table1の)[[column1の長さ, value1の長さ, value2の長さ,...],[column2の長さ, value1の長さ, value2の長さ,...]...], (table2の)[[column1の長さ, value1の長さ, value2の長さ,...],[column2の長さ, value1の長さ, value2の長さ,...]...]...]ってなってる

      // 実際にクエリを整形する
      const result: Array<string> = [];
      const opt = {
        database: "MySQL", // MySQL is the default database
      };
      asts.forEach((ast, queryIndex) => {
        const _sqls = parser
          .sqlify(ast, opt)
          .replace("` (", "`\n(")
          .replace(") VALUES (", ")\nVALUES\n(")
          .replace(/\), \(/g, ")\n(")
          .split("\n");
        _sqls[1] = _sqls[1].replace(/ /g, ""); // カラム名の句からスペース削除
        console.log("pre _sqls:", _sqls);

        const strIns = (str: string, idx: number, val: string) => {
          var res = str.slice(0, idx) + val + str.slice(idx);
          return res;
        };

        const sqls = _sqls.map((sql, _index) => {
          if (!sql.startsWith("(")) {
            return sql;
          }

          let searchGrapheme = ["`,`", "`)"];
          if (_index > 1) {
            searchGrapheme = ["','", "')"];
          }
          let index = _index - 1;
          if (_index > 1) {
            index -= 1;
          }

          let searchStartPos = 0;
          for (
            let columnNum = 0;
            columnNum < setOfMaxLengthForEachColumns[0].length;
            columnNum++
          ) {
            const insertPos =
              sql.indexOf(searchGrapheme[0], searchStartPos) >= 0
                ? sql.indexOf(searchGrapheme[0], searchStartPos) + 1
                : sql.indexOf(searchGrapheme[1], searchStartPos) + 1;
            sql = strIns(
              sql,
              insertPos,
              " ".repeat(
                setOfMaxLengthForEachColumns[queryIndex][columnNum] -
                  setOfLengthForEachColumns[queryIndex][columnNum][index] >
                  0
                  ? setOfMaxLengthForEachColumns[queryIndex][columnNum] -
                      setOfLengthForEachColumns[queryIndex][columnNum][index]
                  : 0
              )
            );
            searchStartPos = insertPos + 1;
          }
          return sql;
        });
        console.log("sqls:", sqls);
        result.push(sqls.join("\n"));
      });
      console.log(result);

      // ファイル全体を置換
      let firstLine = editor.document.lineAt(0);
      let lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      let textRange = new vscode.Range(
        firstLine.range.start,
        lastLine.range.end
      );
      editor.edit((editBuilder) => {
        editBuilder.replace(textRange, result.join("\n---------\n"));
      });
    }
  );
  context.subscriptions.push(disposable2);
}

// This method is called when your extension is deactivated
export function deactivate() {}
