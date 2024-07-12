import { exec } from 'child_process';

exec('git --version', (error, stdout, stderr) => {
    if (error) {
        console.error(`Git is not installed or not found in PATH: ${stderr}`);
        process.exit(1); // Exit with an error code
    } else {
        console.log(`Git version: ${stdout}`);
        process.exit(0); // Exit with success code
    }
});
