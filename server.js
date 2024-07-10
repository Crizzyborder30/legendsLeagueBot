import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs/promises'; 
import cron from 'node-cron';
import dotenv from 'dotenv';
import { type } from 'os';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.static('public'));

const apiKey = process.env.apiToken;
const playerTag = '9V2QJ9LOP'; 

const dataFilePath = 'trophyData.json';

//collects and saves the trophies as soon as the server starts running, but keeps the stats the same
const data = await fetchData();
let oldTrophies = data.trophies;
const savedData = await readData();
const newData = {oldTrophies: oldTrophies, stats: savedData.stats};
await writeData(newData);


// helper function to read data from the json file
async function readData() {
    try {
        const data = await fs.readFile(dataFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        } else {
            throw error;
        }
    }
}

// helper function to write data to the json file
async function writeData(data) {
    try {
        console.log(`Writing data to ${dataFilePath}`);
        await fs.writeFile(dataFilePath, JSON.stringify(data), 'utf8');
        console.log('Data successfully written to file');
    } catch (error) {
        console.error('Error writing data to file:', error);
    }
}


// gets data from the api
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

//runs 07:01 every day, since a new legens day starts at 07:00
//checks if a new season has begun, and then adds a new month-object in the json array
//also adds a new day object in the allStats array
async function eachDay() {
    const data = await fetchData();

    //old season id. used to check if a new month-object should be created
    const season = data.legendStatistics.previousSeason.id; //"2024-06"
    const currentMonth = getCurrentMonth(); //"2024-06"
    const savedData = await readData();

    //checks whether an object for this season already exists in the json file
    //will be true most of the time
    let monthData = savedData.stats.find(month => month.month === currentMonth); //in case a new season has started: false or null

    //when there is a new season, this if-block will run
    if(!monthData && season === currentMonth){
        //if a new season has begun, a new month/season object must be created. it should be the first in the json-array, for convenience. 

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

// scedules the function to run at 07:01 every day
cron.schedule('1 7 * * *', () => {
    console.log('Running the scheduled task at 07:01');
    eachDay();
});


//code that runs every 2 minutes 
async function checkAndLogAttacksAndDefences() {
    const currentDate = new Date();
    console.log(currentDate);
    try{
        const data = await fetchData();
        const newTrophies = data.trophies; //string

        //by the time this function runs the eachDay function should already have created a new object for this day
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

//called to get the data from the coc api
app.get('/player-data', async (req, res) => {

    try {
        const data = await fetchData();
        res.json(data); 
    } catch (error) {
        console.error('Error in /player-data route:', error.message);
        res.status(500).send('Error: ' + error.message);
    }
});


//called to get the data thats saved in the json file
app.get('/trophy-data', async (req, res) => {

    try {
        const data = await readData();
        res.json(data.stats);

    } catch (error) {
        res.status(500).send("Error: " + error.message);
    }

});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

