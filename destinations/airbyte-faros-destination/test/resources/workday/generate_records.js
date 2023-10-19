const fs = require('fs');

// Function to generate random date
function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Function to generate a random record
function generateRecord(id) {
    const firstName = ["John", "Jane", "A", "B", "C"]; // Add as many names as you like
    const lastName = ["Smith", "Doe", "Black", "White", "Brown"]; // Add as many last names as you like
    const teams = ["Team A", "Team B", "Team C", "Team D"];
    const locations = ["Connecticut", "New York", "California", "Texas"];

    const employeeFirstName = firstName[Math.floor(Math.random() * firstName.length)];
    const managerFirstName = firstName[Math.floor(Math.random() * firstName.length)];
    const lastNameSelected = lastName[Math.floor(Math.random() * lastName.length)];

    return {
        record: {
            stream: "mytestsource__workday__customreports",
            emitted_at: new Date().getTime(),
            data: {
                Start_Date: randomDate(new Date(2012, 0, 1), new Date()).toISOString(),
                Full_Name: `${employeeFirstName} ${lastNameSelected}`,
                Employee_ID: (100 + id).toString(), // Making sure it's a string
                Manager_Name: `${managerFirstName} ${lastNameSelected}`,
                Manager_ID: (200 + id).toString(), // Making sure it's a string
                Team_Name: teams[Math.floor(Math.random() * teams.length)],
                Termination_Date: null, // you can set logic for this field depending on your need
                Location: locations[Math.floor(Math.random() * locations.length)],
                Email: `${employeeFirstName.toLowerCase()}${lastNameSelected.toLowerCase()}@co.co`, 
            }
        },
        type: "RECORD"
    };
}

function main() {
    const totalRecords = 100; // however many records you wish to create
    const allRecords = [];

    for (let i = 0; i < totalRecords; i++) {
        allRecords.push(generateRecord(i));
    }

    // Writing to a file in this dir
    fs.writeFileSync('records_output.json', JSON.stringify(allRecords, null, 4)); // Indented 4 spaces
}

// Execute the script - run
// node generate_records.js
main();


