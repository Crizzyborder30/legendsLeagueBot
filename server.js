import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fsProm from 'fs/promises';
import cron from 'node-cron';
import dotenv from 'dotenv';
import axios from 'axios';

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
const updateGithubFile = async (data) => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${dataFilePath}`;
    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
    };

    try {
        // Få nåværende innhold og sha for filen
        let response = await axios.get(url, { headers });
        const sha = response.data.sha;

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

try {
    const data = await fetchData(); //player data from the api
    let oldTrophies = data.trophies; //the trophies at the time of the server being started (should only really be once)
    const savedData = await readData(); //data saved before the server went down
    const newData = { oldTrophies: oldTrophies, stats: savedData.stats }; //changes the old trophy variable but keeps the stats unchanged
    await writeData(newData); //updates the json file
    await updateGithubFile(newData); //pushes the update to github
}
catch (error) {
    console.error("An error occured: ", error);
}
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

// gets data from the api and uses return to return the data
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

//returns the next month and year on the from "2024-06"
function getNextMonth() {
    const date = new Date();
    let nextMonth = date.getMonth() + 2;
    let year = date.getFullYear();
    if (nextMonth === 13) {
        year += 1;
        nextMonth = 1;
    };
    const month = String(nextMonth).padStart(2, "0");
    return `${year}-${month}`;
}

//function to calculate which monday is the last in the month, as that is when a new season starts
function newSeasonStartDate(year, month) {
    //the last day of this month (since the dates start at 1 and not 0 will "month + 1, 0" give us the last day of this month)
    const lastDay = new Date(year, month + 1, 0);
    const dayOfWeek = lastDay.getDay(); //Sunday = 0, Monday = 1 etc.
    //basically an if-else statement to get the amount of days we need to go back from the last day to find the last Monday
    const offset = dayOfWeek >= 1 ? dayOfWeek - 1 : 6;
    return new Date(year, month, lastDay.getDate() - offset);
}

function newSeason(today) {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDayOfNewSeason = newSeasonStartDate(year, month);

    //true or false
    return today.toDateString() === firstDayOfNewSeason.toDateString();
}

function createMonthObject(savedData) {
    if (!savedData.stats) {
        savedData.stats = [];
    }
    if (!savedData.oldTrophies) {
        savedData.oldTrophies = 0;
    }
    const nextMonth = getNextMonth() || 0;
    savedData.stats = [{ "month": nextMonth, "allStats": [] }, ...savedData.stats];

    //if a new season is starting, the thophies gets reset in LL so this line is to not get hundreds of minus the first day of the season
    savedData.oldTrophies = 5000;
}

function createDayObject(today, savedData) {
    if (!savedData.stats || savedData.stats.length === 0) {
        throw new Error("No stats available to add a day object.");
    }
    const day = String(today.getDate()).padStart(2, '0');
    const monthlyStats = savedData.stats[0].allStats || [];

    savedData.stats[0].allStats = [{ date: day, attacks: [], defences: [] }, ...monthlyStats];
}

async function eachDay() {
    let success = false;

    while (!success) {
        try {
            const savedData = await readData();

            const today = new Date();
            const dayOfWeek = today.getDay(); //Sunday = 0, Monday = 1 etc.

            //if its Monday, check if its the last Monday of the month as that is when the new season ends. if so, create a new month-object
            if (dayOfWeek === 1 && newSeason(today)) {
                createMonthObject(savedData);
                await writeData(savedData);
                await updateGithubFile(savedData);
                console.log("New month-object is created and saved. " + today);
            }

            createDayObject(today, savedData);
            await writeData(savedData);
            await updateGithubFile(savedData);
            success = true;
            console.log("New day-object is created and saved. " + today);
        }
        catch (error) {
            console.error("Feil oppstod: ", error)

            console.log("Tries again in 30 secounds...");
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }

}

// scedules the function to run at 06:00 every day
cron.schedule('0 5 * * *', () => {
    console.log('Running the scheduled task at 06:00');
    eachDay();
});


function logAttack(difference, savedData) {
    let todaysAttacks = savedData.stats[0].allStats[0].attacks;
    //if the difference is over 40, there has been two attacks by the time the function has ran
    if (difference > 40) {
        const firstAttack = 40;
        const secondAttack = difference - 40;
        todaysAttacks = [...todaysAttacks, firstAttack, secondAttack];
        savedData.stats[0].allStats[0].attacks = todaysAttacks;

        console.log(`adding ${firstAttack} and ${secondAttack} to attack`);
    }
    else {
        todaysAttacks = [...todaysAttacks, difference];
        savedData.stats[0].allStats[0].attacks = todaysAttacks;

        console.log(`adding ${difference} to attack`);
    }
}

function logDefence(difference, savedData) {
    let todaysDefences = savedData.stats[0].allStats[0].defences;
    //if the difference is under -40, there has been two defeneces by the time the function has ran
    if (difference < -40) {
        const firstDefence = -40;
        const secondDefence = difference + 40;
        todaysDefences = [...todaysDefences, firstDefence, secondDefence];
        savedData.stats[0].allStats[0].defences = todaysDefences;

        console.log(`adding ${firstDefence} and ${secondDefence} to defence`);
    }
    else {
        todaysDefences = [...todaysDefences, difference];
        savedData.stats[0].allStats[0].defences = todaysDefences;

        console.log(`adding ${difference} to defence`);
    }
}



//code that runs every minute
async function checkAndLogAttacksAndDefences() {
    try {
        const data = await fetchData();
        const savedData = await readData();

        const newTrophies = data.trophies; 
        const oldTrophies = savedData.oldTrophies; 
        const difference = newTrophies - oldTrophies;
        
        savedData.oldTrophies = newTrophies;

        const playerLeague = data.league.name;

        if (playerLeague === "Legend League" && difference !== 0) {
            if (difference > 0) {
                logAttack(difference, savedData);
            }
            if (difference < 0) {
                logDefence(difference, savedData);
            }

            await writeData(savedData);
            await updateGithubFile(savedData);
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

