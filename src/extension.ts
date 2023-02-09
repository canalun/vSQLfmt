import * as vscode from "vscode";
import { Parser } from "node-sql-parser";

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
        console.log(insertQuery);

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return parser.astify(insertQuery);
      });

      const setOfMaxLengthForEachColumns: Array<Array<number>> = [];
      const setOfLengthForEachColumns: Array<Array<Array<number>>> = [];
      asts.forEach((_ast) => {
        const ast = Array.isArray(_ast) ? _ast[0] : _ast;
        console.log("ast::", ast);
        const setOfLengthOfColumnNameAndValues: Array<Array<number>> = [];

        if (ast.type !== "insert") {
          return;
        }
        console.log("letetlet");
        ast.columns?.forEach((columnName, index) => {
          console.log("xxxxxxx");
          const lengthOfColumnNameAndValues: Array<number> = [];
          console.log(columnName);
          lengthOfColumnNameAndValues.push(columnName.length);
          ast.values.forEach(
            (value: {
              type: "expr_list";
              value: Array<{
                type: "single_quote_string" | string;
                value: any; // わからない。いろいろある
              }>;
            }) => {
              const charNum =
                value.value[index].type === "single_quote_string"
                  ? String(value.value[index].value).length
                  : String(value.value[index].value).length - 2; // シングルクォーテーションがないときはその分引いておく
              console.log(String(value.value[index].value));
              lengthOfColumnNameAndValues.push(charNum);
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
        console.log("aaaaaaaa");

        const strIns = (str: string, idx: number, val: string) => {
          var res = str.slice(0, idx) + val + str.slice(idx);
          return res;
        };

        const sqls = _sqls.map((sql, _index) => {
          console.log("start lint", _index);
          if (!sql.startsWith("(")) {
            return sql;
          }

          // let searchGrapheme = ["(\`,\`)", "(\`\\))"];
          let searchGrapheme = [
            "((`|NULL|TRUE|FALSE|[0-9]),(`|NULL|TRUE|FALSE|[0-9]))",
            "((`|NULL|TRUE|FALSE|[0-9])\\))",
          ];
          if (_index > 1) {
            // searchGrapheme = ["\',\'", "\'\\)"];
            searchGrapheme = [
              "(('|NULL|TRUE|FALSE|[0-9]),('|NULL|TRUE|FALSE|[0-9]))",
              "(('|NULL|TRUE|FALSE|[0-9])\\))",
            ];
          }
          let index = _index - 1;
          if (_index > 1) {
            index -= 1;
          }

          console.log(
            "setOfMaxLengthForEachColumns",
            setOfMaxLengthForEachColumns
          );
          let searchStartPos = 0;
          for (
            let columnNum = 0;
            columnNum < setOfMaxLengthForEachColumns[queryIndex].length;
            columnNum++
          ) {
            console.log("searchStartPos", searchStartPos);
            let graphemePos = 0;
            let insertPos = 0;
            if (
              columnNum !==
              setOfMaxLengthForEachColumns[queryIndex].length - 1
            ) {
              const re = new RegExp(searchGrapheme[0]);
              graphemePos = sql.substring(searchStartPos).search(re);
              console.log("target:", sql.substring(searchStartPos));
              console.log("reg:", re);
              console.log("graphemePos:", graphemePos);

              insertPos =
                sql.substring(graphemePos + searchStartPos).search(",") +
                graphemePos +
                searchStartPos;
              console.log(
                "nextTar:",
                sql.substring(graphemePos + searchStartPos)
              );
              console.log(
                "insertPos=",
                sql.substring(graphemePos + searchStartPos).search(","),
                "+",
                graphemePos + searchStartPos
              );
            } else {
              const re = new RegExp(searchGrapheme[1]);
              graphemePos = sql.substring(searchStartPos).search(re);
              console.log("target:", sql.substring(searchStartPos));
              console.log("reg:", re);
              console.log("graphemePos:", graphemePos);

              insertPos =
                sql.substring(graphemePos + searchStartPos).search("\\)") +
                graphemePos +
                searchStartPos;
              console.log(
                "nextTar:",
                sql.substring(graphemePos + searchStartPos)
              );
              console.log(
                "insertPos=",
                sql.substring(graphemePos + searchStartPos).search("\\)"),
                "+",
                graphemePos + searchStartPos
              );
            }
            console.log("デバッグ:", setOfMaxLengthForEachColumns);
            console.log("デバッグ:", setOfLengthForEachColumns);
            console.log(queryIndex, columnNum, index);
            const spaceNumToBeAdded =
              setOfMaxLengthForEachColumns[queryIndex][columnNum] -
                setOfLengthForEachColumns[queryIndex][columnNum][index] >
              0
                ? setOfMaxLengthForEachColumns[queryIndex][columnNum] -
                  setOfLengthForEachColumns[queryIndex][columnNum][index]
                : 0;
            console.log("どうでしょうか");

            sql = strIns(sql, insertPos, " ".repeat(spaceNumToBeAdded));
            console.log(sql);
            searchStartPos = insertPos + 1 + spaceNumToBeAdded;
            console.log("-------------------");
          }
          return sql;
        });
        console.log("sqls:", sqls);

        // クエリを再構成
        let formattedQuery = sqls.shift();
        sqls.forEach((sqlFragment: string, index) => {
          // sqls = ['(columns)','VALUES','(values1)','(values2)'...] shiftで0番目の'INSERT...'は消えた
          let delimiter = "\n";
          if (index >= 3) {
            // valueにはコロンを付ける
            delimiter = ",\n";
          }
          formattedQuery = [formattedQuery, sqlFragment].join(delimiter);
        });
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        formattedQuery = formattedQuery?.concat(";") as string;
        result.push(formattedQuery);
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
