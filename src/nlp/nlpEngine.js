import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_SCRIPT = path.join(
  __dirname,
  "analyzeChat.py"
);


export function analyzeChat(messages) {

  return new Promise((resolve, reject) => {

    const python = spawn(
      "python",
      [PYTHON_SCRIPT]
    );

    let output = "";
    let errorOutput = "";


    python.stdout.on(
      "data",
      (data) => {
        output += data.toString();
      }
    );


    python.stderr.on(
      "data",
      (data) => {
        errorOutput += data.toString();
      }
    );


    python.on(
      "close",
      (code) => {

        if (code !== 0) {

          reject(
            new Error(
              errorOutput ||
              `Python exited with code ${code}`
            )
          );

          return;
        }


        try {

          const result =
            JSON.parse(output);

          resolve(result);

        } catch (error) {

          reject(
            new Error(
              `Invalid NLP response: ${output}`
            )
          );
        }
      }
    );


    python.stdin.write(
      JSON.stringify(messages)
    );

    python.stdin.end();
  });
}