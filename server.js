import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fsProm from 'fs/promises';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { type } from 'os';
import path, { resolve } from 'path';
import { exec } from 'child_process';
import axios from 'axios';
import fs from 'fs';
import { get } from 'http';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.static('public'));


// GitHub repo detaljer
const GITHUB_REPO = 'Crizzyborder30/legendsLeagueBot';
const GITHUB_TOKEN = process.env.gitToken;
//const FILE_PATH = 'path/to/your/datafile.json';
const BRANCH = 'main';

const dataFilePath = 'trophyData.json';

// Funksjon for å oppdatere filen på GitHub
const updateGithubFile = async () => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${dataFilePath}`;
    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
    };

    try {
        // Få nåværende innhold og sha for filen
        let response = await axios.get(url, { headers });
        const sha = response.data.sha;
        // Bruk readData for å hente filinnholdet
        const data = await readData();
        if (data === null) {
            throw new Error('Filen ble ikke funnet');
        }
        const encodedContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');


        const updateData = {
            message: 'Automatisk oppdatering av data',
            content: encodedContent,
            sha: sha,
            branch: BRANCH
        };

        // Oppdater filen
        response = await axios.put(url, updateData, { headers });
        if (response.status === 200) {
            console.log('Filen ble oppdatert på GitHub');
        } else {
            console.log(`Feil ved oppdatering av filen: ${response.status}`);
        }
    } catch (error) {
        console.error(`Feil ved henting eller oppdatering av filen: ${error.message}`);
    }
};




const apiKey = process.env.apiToken;
const playerTag = '9V2QJ9LOP';



//collects and saves the trophies as soon as the server starts running, but keeps the stats the same
const data = await fetchData();
let oldTrophies = data.trophies;
const savedData = await readData();
const newData = { oldTrophies: oldTrophies, stats: savedData.stats };
await writeData(newData);
await updateGithubFile();

// helper function to read data from the json file
async function readData() {
    try {
        const data = await fsProm.readFile(dataFilePath, 'utf8');
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
        await fsProm.writeFile(dataFilePath, JSON.stringify(data), 'utf8');
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
    let success = false;

    while (!success) {
        try {
            const data = await fetchData();
            const savedData = await readData();

            //old season id. used to check if a new month-object should be created
            const previousSeason = savedData.previousSeason; //"2024-05"
            const newPreviousSeason = data.legendStatistics.previousSeason.id; //"2024-06"

            //when there is a new season, this if-block will run
            if (previousSeason !== newPreviousSeason) {
                //if a new season has begun, a new month/season object must be created. it should be the first in the json-array, for convenience. 

                //the savedData array is expanded
                const currentMonth = getCurrentMonth();
                savedData.stats = [{ "month": currentMonth, "allStats": [] }, ...savedData.stats];

                //the array containing the new object gets saved in the json file
                await writeData(savedData);

            }

            //regardless of whether a new object was created or not, a new object will be created in the allStats array
            const currentDate = new Date();
            const day = String(currentDate.getDate()).padStart(2, '0');

            //adding the new day-object at the start of the allStats array
            savedData.stats[0].allStats = [{ date: day, attacks: [], defences: [] }, ...savedData.stats[0].allStats];
            savedData.previousSeason = newPreviousSeason;
            await writeData(savedData);
            await updateGithubFile();
            success = true;
        }
        catch (error) {
            console.error("Feil oppstod: ", error)

            console.log("Tries again in 30 secounds...");
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }

}

// scedules the function to run at 07:01 every day
cron.schedule('1 5 * * *', () => {
    console.log('Running the scheduled task at 07:01');
    eachDay();
});


//code that runs every 2 minutes 
async function checkAndLogAttacksAndDefences() {
    const currentDate = new Date();
    console.log(currentDate);
    try {
        const data = await fetchData();
        const newTrophies = data.trophies; //string

        //by the time this function runs the eachDay function should already have created a new object for this day
        const savedData = await readData();
        const oldTrophies = savedData.oldTrophies; //string

        if (oldTrophies !== newTrophies) {

            const difference = newTrophies - oldTrophies; //will be positive for attacks and negative for defences
            savedData.oldTrophies = newTrophies;
            await writeData(savedData);
            //if the difference is positive, the player has attcked and the positive difference is pushed in the back of the list of attacks
            if (difference > 0) {

                //if the difference is over 40, there has been two attacks by the time the function has ran
                if (difference > 40) {
                    const firstAttack = 40;
                    const secondAttack = difference - 40;
                    savedData.stats[0].allStats[0].attacks = [...savedData.stats[0].allStats[0].attacks, firstAttack, secondAttack];
                    console.log(`adding ${firstAttack} and ${secondAttack} to attack`);
                }
                else {
                    savedData.stats[0].allStats[0].attacks = [...savedData.stats[0].allStats[0].attacks, difference];
                    console.log(`adding ${difference} to attack`);
                }

                await writeData(savedData);
                await updateGithubFile();
            }
            //if the difference is negative, the player has recieved a defence and the negative difference is pushed in the back of the list of defences
            if (difference < 0) {

                //if the difference is under -40, there has been two defeneces by the time the function has ran
                if (difference < -40) {
                    const firstDefence = -40;
                    const secondDefence = difference + 40;
                    savedData.stats[0].allStats[0].defences = [...savedData.stats[0].allStats[0].defences, firstDefence, secondDefence];
                    console.log(`adding ${firstDefence} and ${secondDefence} to attack`);
                }
                else {
                    savedData.stats[0].allStats[0].defences = [...savedData.stats[0].allStats[0].defences, difference];
                    console.log(`adding ${difference} to defence`);
                }

                await writeData(savedData);
                await updateGithubFile();
            }
        } else {
            console.log("no difference in trophies detected");
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

//makes the function run every minute
setInterval(checkAndLogAttacksAndDefences, 60000);

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

