import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs/promises'; // Asynkrone filsystem operasjoner
import cron from 'node-cron';
import dotenv from 'dotenv';
import { type } from 'os';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.static('public'));

const apiKey = process.env.apiToken;
const playerTag = '9V2QJ9LOP'; // uten #

const dataFilePath = 'trophyData.json'; // Fil for å lagre data


//collects and saves the trophies as soon as the server starts running, but keeps the stats the same
const data = await fetchData();
let oldTrophies = data.trophies;
const savedData = await readData();
const newData = {oldTrophies: oldTrophies, stats: savedData.stats};
await writeData(newData);


// Hjelpefunksjon for å lese data fra fil
async function readData() {
    try {
        const data = await fs.readFile(dataFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Hvis filen ikke finnes, returner null
        if (error.code === 'ENOENT') {
            return null;
        } else {
            throw error;
        }
    }
}

// Hjelpefunksjon for å skrive data til fil
async function writeData(data) {
    try {
        console.log(`Writing data to ${dataFilePath}`);
        await fs.writeFile(dataFilePath, JSON.stringify(data), 'utf8');
        console.log('Data successfully written to file');
    } catch (error) {
        console.error('Error writing data to file:', error);
    }
}


//henter data fra apiet og returnerer hele data-objektet
async function fetchData() {
    const url = `https://api.clashofclans.com/v1/players/%23${playerTag}`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data from API:', error.message);
        throw error;
    }

}

//returns the current month and year on the from "2024-06"
function getCurrentMonth() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

//runs 07:01 every day
//checks if a new season has begun, and then adds a new month-object in the json array
//also adds a new day object in the allStats array
async function eachDay() {

    //new updated data
    const data = await fetchData();

    //old season id. used to check if a new month-object should be created
    const season = data.legendStatistics.previousSeason.id; //"2024-06"
    const currentMonth = getCurrentMonth(); //"2024-06"

    //at the start: none, after a while on the form: { trophies: "1234", stats: [{month: june, allStats: [ {attacks: [], defences: [] } ] } ]}
    const savedData = await readData() || {};

    //checks whether an object for this season already exists in the json file
    //most of the time it will be true
    let monthData = savedData.stats.find(month => month.month === currentMonth); //in case of a new season: false or null

    //when there is a new season, this if-block will run
    //if this seasons object doesnt already exist, and the current month is equal to the last season id -> run the code
    if(!monthData && season === currentMonth){
       
        //if a new season has begun, a new month/season object must be created. it should be the first in the json-array, and therefore
        //have the id = 0 for convenience. 

        //the savedData array is expanded
        savedData.stats = [{"month": currentMonth, "allStats": []}, ...savedData.stats];

        //the array containing the new object gets saved in the json file
        await writeData(savedData);

    }

    //regardless of whether a new object was created or not, a new object will be created in the allStats array
    const currentDate = new Date();
    const day = String(currentDate.getDate()).padStart(2, '0');

    //adding the new day-object at the start of the allStats array
    savedData.stats[0].allStats = [{date: day, attacks: [], defences: []}, ...savedData.stats[0].allStats];
    await writeData(savedData);

}

// Planlegge at funksjonen skal kjøre klokken 07:01 hver dag
cron.schedule('1 7 * * *', () => {
    console.log('Running the scheduled task at 07:01');
    eachDay();
});


//code that runs every 2 minutes 
async function checkAndLogAttacksAndDefences() {
    const currentDate = new Date();
    console.log(currentDate);
    try{
        //new updated trophies
        const data = await fetchData();
        const newTrophies = data.trophies; //string

        //by the time this function runs the shell of the json file should already be created, and the trophies been defined
        const savedData = await readData();
        const oldTrophies = savedData.oldTrophies; //string

        if(oldTrophies !== newTrophies){
            
            const difference = newTrophies - oldTrophies; //will be positive for attacks and negative for defences
            savedData.oldTrophies = newTrophies;
            await writeData(savedData);
            //if the difference is positive, the player has attcked and the positive difference is pushed in the back of the list of attacks
            if(difference > 0){
                savedData.stats[0].allStats[0].attacks = [...savedData.stats[0].allStats[0].attacks, difference];
                console.log(`adding ${difference} to attack`);
                await writeData(savedData);
            }
            //if the difference is negative, the player has recieved a defence and the negative difference is pushed in the back of the list of defences
            if(difference < 0) {
                savedData.stats[0].allStats[0].defences = [...savedData.stats[0].allStats[0].defences, difference];
                console.log(`adding ${difference} to defence`);
                await writeData(savedData);
            }
        } else {
            console.log("no difference in trophies detected");
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

//makes the function run every two minutes
setInterval(checkAndLogAttacksAndDefences, 120000);

//frontend-portal to the data-object
app.get('/player-data', async (req, res) => {

    try {
        const data = await fetchData();
        res.json(data);  // Send data som JSON
    } catch (error) {
        console.error('Error in /player-data route:', error.message);
        res.status(500).send('Error: ' + error.message);
    }
});


//frontend-portal to the data thats saved in the json file
app.get('/trophy-data', async (req, res) => {

    try {
        const data = await readData();
        res.json(data.stats);

    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }

});

//the main portal to the frontend-code
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

