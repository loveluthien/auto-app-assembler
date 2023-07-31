// Display the contents of "carta-frontend-commits.json" and "carta-backend-commits.json" by default
// These files are created by server.js and that uses webhooks to list every frontend and backend commit.
async function fetchCommits(repo) {
    const response = await fetch(`/commits/${repo}`);
    const data = await response.json();
    return data;
}

function displayCommits(data, commitContainerId, commitType) {
    const commitContainer = document.getElementById(commitContainerId);
    commitContainer.innerHTML = ''; // clear previous contents
    for (let i = 0; i < data.length; i++) {
        const radioButton = document.createElement('input');
        radioButton.type = 'radio';
        radioButton.name = commitType;
        radioButton.value = data[i].shortId;
        radioButton.id = commitType + '-' + i;
        commitContainer.appendChild(radioButton);

        const label = document.createElement('label');
        label.htmlFor = commitType + '-' + i;

        // Format the date and time as a string
        let datePart = '';
        let timePart = '';
        if (data[i].timestamp) {
            const dateStr = new Date(data[i].timestamp).toISOString();
            datePart = dateStr.split('T')[0];
            timePart = dateStr.split('T')[1].split('.')[0];
        }

        // show branch name, date, time, and short commit ID
        label.appendChild(document.createTextNode(`${data[i].branch}  ${datePart} ${timePart} (${data[i].shortId})`));
        commitContainer.appendChild(label);

        commitContainer.appendChild(document.createElement('br'));
    }
}


// Function to recursively fetch all pages of github branches
async function getAllBranches(url) {
    const response = await fetch(url);
    const data = await response.json();

    // Check if there are more pages of branches
    const linkHeader = response.headers.get('Link');
    if (linkHeader) {
        const nextPageLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
        if (nextPageLink) {
            const nextPageUrl = nextPageLink.split(';')[0].slice(1, -1);
            const nextPageData = await getAllBranches(nextPageUrl);
            return data.concat(nextPageData);
        }
    }
    return data;
}

async function fetchBranches(url) {
    let data = await getAllBranches(url);
    // remove 'archived' branches
    data = data.filter(branch => !branch.name.startsWith('archived'));
    return data;
}

function displayBranches(data, branchContainerId, branchType) {
    const branchContainer = document.getElementById(branchContainerId);
    branchContainer.innerHTML = ''; // clear previous contents
    for (let i = 0; i < data.length; i++) {
        const radioButton = document.createElement('input');
        radioButton.type = 'radio';
        radioButton.name = branchType;
        radioButton.value = data[i].commit.sha.substring(0, 8);  // use the short commit ID
        radioButton.id = branchType + '-' + i;
        branchContainer.appendChild(radioButton);

        const label = document.createElement('label');
        label.htmlFor = branchType + '-' + i;
        
        // Format the date and time as a string
        let datePart = '';
        if (data[i].commit.date) {
            const dateStr = data[i].commit.date.toISOString();
            datePart = dateStr.split('T')[0];
        }

        // show branch name, date, and short commit ID
        label.appendChild(document.createTextNode(`${data[i].name}  ${datePart}  (${data[i].commit.sha.substring(0, 8)})`));
        branchContainer.appendChild(label);

        branchContainer.appendChild(document.createElement('br'));
    }
}

async function sortBranches(data, branchContainerId, branchType) {
    // Get commit dates
    const commits = await Promise.all(data.map(branch => fetch(branch.commit.url)));
    const commitData = await Promise.all(commits.map(commit => commit.json()));
    for (let i = 0; i < data.length; i++) {
        data[i].commit.date = new Date(commitData[i].commit.committer.date);
    }

    // Sort by commit date
    data.sort((a, b) => b.commit.date - a.commit.date);

    // Display the sorted data
    displayBranches(data, branchContainerId, branchType);
}

// Show the latest commits from the local .json files by default, plus reverse the order
fetchCommits('carta-frontend').then(data => displayCommits(data.reverse(), 'frontend-branch', 'frontend-branch'));
fetchCommits('carta-backend').then(data => displayCommits(data.reverse(), 'backend-branch', 'backend-branch'));

// Show non-sorted branch list by default
//fetchBranches('https://api.github.com/repos/CARTAvis/carta-frontend/branches?per_page=100').then(data => displayBranches(data, 'frontend-branch', 'frontend-branch'));
//fetchBranches('https://api.github.com/repos/CARTAvis/carta-backend/branches?per_page=100').then(data => displayBranches(data, 'backend-branch', 'backend-branch'));

// Show the sorted branches if the buttons are pressed
document.getElementById('frontend-sort-button').addEventListener('click', () => {
    fetchBranches('https://api.github.com/repos/CARTAvis/carta-frontend/branches?per_page=100').then(data => sortBranches(data, 'frontend-branch', 'frontend-branch'));
});
document.getElementById('backend-sort-button').addEventListener('click', () => {
    fetchBranches('https://api.github.com/repos/CARTAvis/carta-backend/branches?per_page=100').then(data => sortBranches(data, 'backend-branch', 'backend-branch'));
});


// Button that will send the branch names to be built
$(document).ready(function() {

    $.get('/aaa/getInitiatorState', (res) => {
        isProcessInitiator = res;
    });

  let isProcessInitiator = false;

function generateScript(scriptName) {
    console.log('Button clicked');
    const frontendBranch = $('input[name="frontend-branch"]:checked').val();
    const backendBranch = $('input[name="backend-branch"]:checked').val();
    
    // Make sure both branches are selected before clicking a button
    if (frontendBranch === undefined || backendBranch === undefined) {
        console.log('Both branches need to be selected first.');
        return;
    }

    isProcessInitiator = true;
    console.log('Frontend branch:', frontendBranch);
    console.log('Backend branch:', backendBranch);

    $('#buildOverlay').show();

    $.post('/aaa/generate', { scriptName, frontendBranch, backendBranch }, (res) => {
        console.log('Response:', res);
    }).fail(function(jqXHR, textStatus, errorThrown) {
        if (jqXHR.status === 429) {
            $('#buildOverlay').hide();
            $('#busyOverlay').show();
        } else {
            console.log('Error in POST request:', textStatus, errorThrown);
        }
    });
}

$('#generate-button-linux').click(() => generateScript('create-carta-appimage.sh'));
$('#generate-button-macos-arm64').click(() => generateScript('create-carta-macos-arm64.sh'));
$('#generate-button-macos-x64').click(() => generateScript('create-carta-macos-x64.sh'));

const eventSource = new EventSource('/events');

   eventSource.onmessage = (event) => {
        console.log(`Received event: ${event.data}`); // debugging
        switch(event.data) {
            case 'bashScriptStarted':
              if (!isProcessInitiator) {           // Show the busyOverlay to clients that did not initiate the build process
                  $('#busyOverlay').show();
              }
              break;
            case 'bashScriptFinished':
                console.log('Hiding overlays');
                $('#buildOverlay').hide();
                $('#busyOverlay').hide();
                updateFileList();  // Update the download list
                isProcessInitiator = false;  // Reset the variable
                break;
            case 'otherUserScriptRunning':
                if (!isProcessInitiator) {         // Show busyOverlay if client did not initiate the process
                    $('#buildOverlay').hide();
                    $('#busyOverlay').show();
                }
                break;
            default:
                console.log(`Unknown event: ${event.data}`);
                break;
        }
    };

// Keep the download list up to date
//function updateFileList() {
//    $.get('/downloads', (files) => {
//        const fileList = $('#file-list');
//        fileList.empty();
//        files.forEach((file) => {
//            fileList.append(`<li><a href="/downloads/${encodeURIComponent(file)}">${file}</a></li>`);
////            fileList.append(`<li><a href="/scratch/appimage-assembler-downloads/${encodeURIComponent(file)}">${file}</a></li>`);
//        });
//    });
//}

// Sort by date
function updateFileList() {
    $.get('/downloads', (files) => {
        const fileList = $('#file-list');
        fileList.empty();

        files.sort((a, b) => {
            // Extract the date string from the file names
            const dateA = a.match(/\d{4}-\d{2}-\d{2}/)[0];
            const dateB = b.match(/\d{4}-\d{2}-\d{2}/)[0];

            // Return the comparison result
            return new Date(dateB) - new Date(dateA);
        });

        files.forEach((file) => {
            fileList.append(`<li><a href="/downloads/${encodeURIComponent(file)}">${file}</a></li>`);
        });
    });
}


updateFileList();  // Update the download list when the page loads

});
