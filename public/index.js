document.addEventListener('DOMContentLoaded', async () => {
    displayBasicPlayerData();
    createDropdown();
    const stats = await getDataFromJSON();
    createAllTables(stats[0].allStats); 
});

//"June 2024"
function formatDateToMonthYear(date) {
    const options = { month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat('en-US', options).format(date);
}

//runs once the page is loaded, fetches the data from the api, and displays some basic data on the page
async function displayBasicPlayerData() {
    const currentDate = new Date();
    console.log(currentDate);
    try {
        const response = await fetch(`${window.location.origin}/player-data`);
        if (!response.ok) {
            throw new Error('Not able to get data from the API');
        }
        const data = await response.json();  // Konverter respons til JSON
        console.log(data);
        document.getElementById("player-data").innerHTML = "Player: " + data.name +
            "<br>Current trophies: " + data.trophies +
            "<br>Current season: " + formatDateToMonthYear(currentDate);

    } catch (error) {
        console.error('Error:', error);
    }
}

//gonna run once the page opens aswell, gets the data from the json file by making a call to localhost/trophy-data
//this data will be used to fill in the daily tables
async function getDataFromJSON() {  

    try{
        const response = await fetch(`${window.location.origin}/trophy-data`);
        if (!response.ok) {
            throw new Error('Not able to get data from JSON');
        }
        const data = await response.json();  
        return data;

    } catch (error) {
        console.log("Error " + error);
    }
}

//dropDownmenu. Will be used by the getLoggedData function aswell as the event-listener
const dropDown = document.getElementById("selectMonth");

// listening for changes in the drop-down element
dropDown.addEventListener('change', async (event) => {

    // gets the value of the chosen month
    const selectedValue = event.target.value;
    console.log('Selected month:', selectedValue);
    const stats = await getDataFromJSON();

    // finds the object in the json-file that has a matching month-value
    const selectedMonthData = stats.find(month => month.month === selectedValue);

    //clears the allTables div, to make room for the new data to be displayed
    const allTables = document.getElementById("allTables");
    allTables.innerHTML = "";

    //creates tables for the selected month
    createAllTables(selectedMonthData.allStats);

});


async function createDropdown() {  
        const stats = await getDataFromJSON();  
        dropDown.innerHTML = '';

        //for each month thats logged, an option in the dropdownmenu is created
        stats.forEach(stat => {
            dropDown.innerHTML += `<option value=${stat.month}> ${stat.month} </option>`
        })
}


//argument looks like this: {date, attacks, defences}
function createTable(allStats) {

    const date = allStats.date; //string
    const attacks = allStats.attacks; //array
    const defences = allStats.defences; //array

    const allTables = document.getElementById("allTables");
    const table = document.createElement("table");
    allTables.appendChild(table);

    //makes the table with the 8 daily attacks and defences
    for (let i = 0; i < 8; i++) {
        const row = table.insertRow();
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        cell1.textContent = attacks[i];
        cell2.textContent = defences[i];
    }

    //calculates and displays the sum of attacks and defences
    const row = table.insertRow();
    const sumAttack = row.insertCell(0);
    const sumDefence = row.insertCell(1);

    const totalAttack = attacks.reduce((acc, val) => acc + val, 0);
    const totalDefence = defences.reduce((acc, val) => acc + val, 0);

    sumAttack.textContent = totalAttack;
    sumDefence.textContent = totalDefence;

    //calcualtes and displays the total amont of thophies gained/lost and shows the date aswell as giving the cells an id and style
    const thead = table.insertRow(0);
    const dateCell = thead.insertCell(0);
    dateCell.textContent = date;
    dateCell.id = "dateCell";
    dateCell.style = "background-color: white";

    const sumDay = thead.insertCell(1);
    sumDay.textContent = totalAttack + totalDefence;
    sumDay.id = "sumDay";

    sumDay.style = "background-color: white";
    if (totalAttack + totalDefence > 0) {
        sumDay.style = "background-color: green";
    }
    else if (totalAttack + totalDefence === 0) {
        sumDay.style = "background-color: yellow";
    }
    else {
        sumDay.style = "background-color: red";
    }
}

//argument is an array with objects
function createAllTables(allStats) {
    allStats.forEach(stats => {
        createTable(stats);
    });
}





