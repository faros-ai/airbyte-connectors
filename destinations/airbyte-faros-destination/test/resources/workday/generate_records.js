const fs = require('fs');
const {flip} = require('lodash');

// Function to generate random date
function randomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function generateRecord(employee_rec) {

    return {
        record: {
            stream: "mytestsource__workday__customreports",
            emitted_at: new Date().getTime(),
            data: employee_rec 
        },
        type: "RECORD"
    };

}
// function tmp() {
//     return {
//         record: {
//             stream: "mytestsource__workday__customreports",
//             emitted_at: new Date().getTime(),
//             data: {
//                 Start_Date: randomDate(new Date(2012, 0, 1), new Date()).toISOString(),
//                 Full_Name: `${employeeFirstName} ${lastNameSelected}`,
//                 Employee_ID: (100 + id).toString(), // Making sure it's a string
//                 Manager_Name: `${managerFirstName} ${lastNameSelected}`,
//                 Manager_ID: (200 + id).toString(), // Making sure it's a string
//                 Team_Name: teams[Math.floor(Math.random() * teams.length)],
//                 Termination_Date: null, // you can set logic for this field depending on your need
//                 Location: locations[Math.floor(Math.random() * locations.length)],
//                 Email: `${employeeFirstName.toLowerCase()}${lastNameSelected.toLowerCase()}@co.co`,
//             }
//         },
//         type: "RECORD"
//     };
// }

function createEmployees(n) {
  // returns mapping of employee ID to data
  const employeeIDtoRec = {};
  for (let i = 0; i < n; i++) {
    const employee_rec = createEmployee(i);
    employeeIDtoRec[employee_rec.Employee_ID] = employee_rec;
  }
  return employeeIDtoRec;
}

function createEmployee(id) {
  const firstName = [
    'Olivia',
    'Liam',
    'Emma',
    'Noah',
    'Ava',
    'Oliver',
    'Isabella',
    'Elijah',
    'Sophia',
    'Lucas',
    'Charlotte',
    'James',
  ];
  const lastName = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
    'Hernandez',
    'Lopez',
  ];
  const locations = ['Connecticut', 'New York', 'California', 'Texas'];

  const employeeFirstName =
    firstName[Math.floor(Math.random() * firstName.length)];
  const lastNameSelected =
    lastName[Math.floor(Math.random() * lastName.length)];
  return {
    Start_Date: randomDate(new Date(2012, 0, 1), new Date()).toISOString(),
    Full_Name: `${employeeFirstName} ${lastNameSelected}`,
    Employee_ID: (100 + id).toString(),
    Termination_Date: null,
    Location: locations[Math.floor(Math.random() * locations.length)],
    Email: `${employeeFirstName.toLowerCase()}${lastNameSelected.toLowerCase()}@co.co`,
  };
}

function getRandomNumbers(m, N) {
  // Generate an array from 1 to N
  const numbers = Array.from({length: N}, (_, i) => i + 1);

  // Fisher-Yates Shuffle algorithm to shuffle the array
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]]; // Swap numbers[i] with numbers[j]
  }

  // Return the first 'm' numbers from the shuffled array
  return numbers.slice(0, m);
}

function assignManagersToTeams(employeeIDtoRec, teamToParentTeam) {
  const employees = Object.keys(employeeIDtoRec);
  const teamNames = Object.keys(teamToParentTeam);
  console.log("Team Names:")
  console.log(JSON.stringify(teamNames))
  if (teamNames.length > employees.length) {
    throw new Error('more teams than employees');
  }
  const random_numbers = getRandomNumbers(teamNames.length, employees.length - 1);
  console.log(JSON.stringify(random_numbers))
  const TeamsToManagers = {};
  for (let i = 0; i < teamNames.length; i++) {
    TeamsToManagers[teamNames[i]] = employees[random_numbers[i]];
  }
  console.log(JSON.stringify(Object.entries(TeamsToManagers)))
  return TeamsToManagers;
}

function assignEmployeesToTeams(
  employeeIDtoRec,
  teamToParentTeam,
  TeamsToManagers
) {
    console.log("Teams to Managers:")
    console.log(JSON.stringify(TeamsToManagers))
  const ManagerIDs = Object.values(TeamsToManagers);
  const flipObject = (obj) =>
    Object.fromEntries(Object.entries(obj).map(([key, value]) => [value, key]));
  const ManagersToTeams = flipObject(TeamsToManagers);
  const teamNames = Object.keys(teamToParentTeam);
  for (const e_rec of Object.keys(employeeIDtoRec)) {
    let team = null;
    if (ManagerIDs.includes(e_rec)) {
      team = teamToParentTeam[ManagersToTeams[e_rec]];
    } else {
      team = teamNames[Math.floor(Math.random() * teamNames.length)];
    }
    console.log("team: " + team)
    if (team) {
    const Manager_ID = TeamsToManagers[team];
    console.log("Manager_ID: " + Manager_ID)
    const Manager_Name = employeeIDtoRec[Manager_ID].Full_Name;
    employeeIDtoRec[e_rec]['Team_Name'] = team;
    employeeIDtoRec[e_rec]['Manager_ID'] = Manager_ID;
    employeeIDtoRec[e_rec]['Manager_Name'] = Manager_Name;
    } else {
        const Manager_ID = "None";
        const Manager_Name = "None" ;
        employeeIDtoRec[e_rec]['Team_Name'] = team;
        employeeIDtoRec[e_rec]['Manager_ID'] = Manager_ID;
        employeeIDtoRec[e_rec]['Manager_Name'] = Manager_Name;
    }
  }
  return employeeIDtoRec;
}

function main() {
  const nEmployees = 100;
  const teamToParentTeam = {
    TopDog: null,
    A: 'TopDog',
    B: 'TopDog',
    ChiefExecs: 'TopDog',
    C: 'ChiefExecs',
    D: 'ChiefExecs',
    Engineering: 'D',
    F: 'Engineering',
    G: 'Engineering',
    Security: 'D',
    SecurityContracts: 'Security',
    E: 'Security',
  };

  const employeeIDtoRec = createEmployees(nEmployees);
  const TeamsToManagers = assignManagersToTeams(
    employeeIDtoRec,
    teamToParentTeam
  );

    assignEmployeesToTeams(employeeIDtoRec, teamToParentTeam, TeamsToManagers);

    const allRecords = [];
  for (const employee_rec of Object.values(employeeIDtoRec)) {
    allRecords.push(generateRecord(employee_rec));
  }

  // Writing to a file in this dir
  fs.writeFileSync('records_output.json', JSON.stringify(allRecords, null, 4)); // Indented 4 spaces
}

// Execute the script - run
// node generate_records.js
main();
