#!/usr/bin/env node

"use strict";

const path = require("path");
const fs = require("fs");

function printHelp() {
  const script = path.basename(process.argv[1]);
  console.log(`Usage: ${script} <notebook.ipynb> [output-dir]

Explodes a Jupyter Notebook (ipynb) into numbered section files, one per cell.

Arguments:
  <notebook.ipynb>  Path to the .ipynb file to split
  [output-dir]      Directory to write cell files (defaults to cwd)

Options:
  --dry-run         Parse input and report actions without writing files
`);
}

function createPlotlyHtml(plotlyData, plotlyLayout) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.plot.ly/plotly-3.3.0.min.js"></script>
    <title>Plotly Chart</title>
</head>
<body>
    <div id="plotly-div" style="width:100%;height:100%;"></div>
    <script>
        const data = ${JSON.stringify(plotlyData)};
        const layout = ${JSON.stringify(plotlyLayout)};
        Plotly.newPlot('plotly-div', data, layout);
    </script>
</body>
</html>
`;
} 

/**
 * ipynb parsing logic. 
 * Ipynb is a json file which contains a cell attribute at the top level.
 * If dry-run enabled, only shows what would be done. 
 * Otherwise, writes each of the cell contents to suitable files.
 */
function splitIpynb(inputPath, outputDir, dryRun) {

  const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const cells = data.cells || [];
  cells.forEach((cell, index) => {
    const cellType = cell.cell_type || "unknown";
    const fileName = `cell_${index + 1}_src.${cellType === "code" ? "py" : "md"}`;
    const filePath = path.join(outputDir, fileName);
    const content = (cell.source || []).join("");

    const outputs = cell.outputs || [];
    const outputFilePaths = []
    const outputContents = [];
    
    if (cellType === "code" && outputs.length > 0) {
      let outputExtension = "txt";

      outputs.forEach((output, outIndex) => {
        try {
          if (output.output_type === "stream" && output.text) {
            outputContents.push(output.text.join(""));
          } else if (output.data["image/png"] !== undefined) {
            outputContents.push(Buffer.from(output.data["image/png"], "base64"));
            outputExtension = "png";
          } else if (output.data["application/vnd.plotly.v1+json"] !== undefined) {
            // expect a config, data, and layout
            const plotlyData = output.data["application/vnd.plotly.v1+json"].data;
            const plotlyLayout = output.data["application/vnd.plotly.v1+json"].layout;
            outputContents.push(createPlotlyHtml(plotlyData, plotlyLayout));
            outputExtension = "html";
          } else if (output.data["text/html"] !== undefined) {
            outputContents.push(output.data["text/html"].join(""));
            outputExtension = "html";
          } else {
            console.warn(`Warning: unhandled output type ${output.data[0]} in cell ${index + 1}`);
            outputContents.push(JSON.stringify(output));
          }
        } catch (err) {
          console.warn(`Warning: failed to process output ${outIndex + 1} of cell ${index + 1}: ${err}`);
          outputContents.push(JSON.stringify(output));
        }
        
        const outputFileName = `cell_${index + 1}_output_${outIndex + 1}.${outputExtension}`;
        outputFilePaths.push(path.join(outputDir, outputFileName));      
      });
    }
    
    if (dryRun) {
      console.log(`[Dry Run] Would write cell ${index + 1} (${cellType}) to ${filePath}`);
      if (outputs.length > 0) {
        outputFilePaths.forEach((outputFilePath, i) => {
          console.log(`[Dry Run] Would write output of cell ${index + 1} to ${outputFilePath}`);
        });
      }
    } else {
      fs.writeFileSync(filePath, content, "utf-8");
      console.log(`Wrote cell ${index + 1} (${cellType}) to ${filePath}`);
      if (outputs.length > 0) {
        outputFilePaths.forEach((outputFilePath, i) => {
          fs.writeFileSync(outputFilePath, outputContents[i], "utf-8");
          console.log(`Wrote output of cell ${index + 1} to ${outputFilePath}`);
        });
      }
    }
  });
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  if (!args.includes("--dry-run") && args.length < 2) {
    console.error("Error: missing required arguments. Use --help for usage.");
    process.exit(1);
  }

  const dryRun = args.includes("--dry-run");
  const positionalArgs = args.filter((arg) => arg !== "--dry-run");

  const inputPath = positionalArgs[0];
  const outputDir = positionalArgs[1] || process.cwd();

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  splitIpynb(inputPath, outputDir, dryRun);
}

main();
