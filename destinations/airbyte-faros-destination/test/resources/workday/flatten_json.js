
const fs = require('fs');

function readAndParseJSONFile(filePath, outputFilePath) {
    let output_string = '';
    // Check if the file path was provided
    if (!filePath) {
        console.error('Please provide a valid file path.');
        return;
    }

    // Read the JSON file
    fs.readFile(filePath, 'utf8', (err, fileContents) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        try {
            // Parse the JSON data
            const data = JSON.parse(fileContents);
            for (const rec of data) {
                output_string += JSON.stringify(rec) + "\n"
            }
            console.log(output_string);
            fs.writeFile(outputFilePath, output_string, (err) => {
                // In case of a write error
                if (err) {
                    console.error("An error occurred:", err);
                    return;
                }
                // Success message
                console.log("Data written to file " + outputFilePath);
            });            



        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
        }
    });
}

// Main function to run tasks
function main() {
    // The process.argv property returns an array containing the command line arguments passed when the Node.js process was launched.
    // The first element is process.execPath (the path to the node executable),
    // the second element is the path to the JavaScript file being executed,
    // and the remaining elements are any additional command line arguments.
    const inputFilePath = process.argv[2];
    const outputFilePath = process.argv[3];
    if (!(outputFilePath)) {
        throw new Error('Missing output filepath')
    }

    // Call the function with the file path argument
    readAndParseJSONFile(inputFilePath, outputFilePath);
}

// Execute the script
main();