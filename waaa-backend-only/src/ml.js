import { spawn } from "child_process";
import path from "path";

const pythonCommand =
  process.platform === "win32"
    ? "python"
    : "python3";

const predictorPath = path.resolve(
  "ml/predict_combined.py"
);


function runPrediction(type, text) {

  return new Promise((resolve) => {

    const python = spawn(
      pythonCommand,
      [
        predictorPath,
        type,
        text,
      ],
      {
        windowsHide: true,
      }
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

          console.error(
            `[ML] Python exited with code ${code}`
          );

          console.error(
            errorOutput
          );

          resolve({
            prediction: 0,
            probability: 0,
            error: errorOutput,
          });

          return;
        }

        try {

          const result =
            JSON.parse(output.trim());

          resolve(result);

        } catch (error) {

          console.error(
            "[ML] Invalid Python response:",
            output
          );

          resolve({
            prediction: 0,
            probability: 0,
            error: error.message,
          });
        }
      }
    );
  });
}


export async function predictFraud(text) {

  return runPrediction(
    "fraud",
    text
  );
}


export async function predictImportance(text) {

  return runPrediction(
    "importance",
    text
  );
}