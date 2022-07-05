const pluginID = "bf2042-portal-github-plugin";
const plugin = BF2042Portal.Plugins.getPlugin(pluginID);
const userAgent = plugin.manifest.id + "/" + plugin.manifest.version;
let octokit;
let gitHubPluginData = {
  experiences: [
    {
      playgroundId: "",
      personalAccessToken: "",
      repositoryName: "",
      workspacePath: "workspace.xml",
      auth: {},
      commitOnSave: true,
    }
  ]
}

function loadPluginData() {
  let loadedData = localStorage.getItem(pluginID);
  console.log("GitHubPlugin - loaded plugin data.");
  if (loadedData != null) {
    loadedData = JSON.parse(loadedData);
    if (!loadedData || !loadedData.experiences[0].playgroundId == "") {
      console.error("GitHub Plugin: invalid plugin data retrieved from storage.");
    } else {
      gitHubPluginData = loadedData;
    }
  }
}

function storePluginData() {
  let pluginDataString = JSON.stringify(gitHubPluginData);
  localStorage.setItem(pluginID, pluginDataString);
  console.log("GitHubPlugin - storing plugin data.");
}

function getPlaygroundID() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("playgroundId")) {
    return params.get("playgroundId");
  }
  return "";
}

function getPluginDataForPlayground(playgroundId) {
  return gitHubPluginData.experiences.find(el => el.playgroundId == playgroundId);
}

function loadFormattedXML(data) {
  const workspace = _Blockly.getMainWorkspace();

  try {
    _Blockly.Xml.domToWorkspace(_Blockly.Xml.textToDom(data ? data : "<xml />"), workspace);
    return true;
  } catch (e) {
    BF2042Portal.Shared.logError("Failed to load workspace!", e);
  }

  return false;
}

function addSaveBtnObserver() {
  const observer = new MutationObserver(highlightSaveBtn);
  const mutationEvents = {
    childList: true,
    subtree: true
  };

  observer.observe(document.body, mutationEvents);
}

function highlightSaveBtn() {
  let saveBtn = document.querySelector('[aria-label="save button"]');
  if (!saveBtn) {
    //console.log("GitHub Plugin: Could not highlight save-button");
  } else {
    saveBtn.style.backgroundColor = "red";
    saveBtn.onmouseup = saveBtnClicked;
  }
}

function saveBtnClicked(event) {
  if (event.button == 0) {
    gitHubCommit();
  }
}

async function initGitHubPlugin() {
  octokitModule = await import("https://cdn.skypack.dev/octokit");
  loadPluginData();
  addSaveBtnObserver();
  highlightSaveBtn();
}

function askForRepoSetup() {
  if (confirm("You have not setup a repository for this experience - would you like to do so now?")) {
    setupRepository();
  }
}

function showDialog() {
  const styleElement = document.createElement("style");
  styleElement.setAttribute("type", "text/css");

  styleElement.innerHTML = `
        .github-plugin-modal {
          display: none;
          position: fixed;
          z-index: 1000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          overflow: auto;
          background-color: rgb(0, 0, 0);
          background-color: rgba(0, 0, 0, 0.4);
      }

      .github-plugin-modal-content {
          background-color: #424242;
          color: #fff;
          margin: 15% auto;
          padding: 20px;
          border: 1px solid #888;
          width: 80%;
      }

      .github-plugin-modal-title {
          background-color: #26ffdf;
          color: #000;
          font-size: large;
      }

      .github-plugin-modal-close {
          color: #000;
          float: right;
          font-size: 28px;
          font-weight: bold;
      }

      .github-plugin-modal-close:hover,
      .github-plugin-modal-close:focus {
          color: black;
          text-decoration: none;
          cursor: pointer;
      }
        `;
  document.head.appendChild(styleElement);
  const modalDialog = document.createElement("div");
  modalDialog.setAttribute("class", "github-plugin-modal");
  modalDialog.setAttribute("id", "github-plugin-modal");
  modalDialog.innerHTML = `
  <div class="github-plugin-modal-content">
    <span class="github-plugin-modal-title">GitHub Setup</span>
    <span class="github-plugin-modal-close">&times;</span>
    <p>Some text in the Modal..</p>
    <input type="button" value="Cancel" onclick="hideDialog()"/>
    <input type="button" value="Ok" onclick="hideDialog()"/>
  </div>
  `;
  document.body.appendChild(modalDialog);
  modalDialog.style.display = "block";
}

function hideDialog(){
  document.getElementById('github-plugin-modal').style.display = 'none';
}

function setupRepository() {
  let personalAccessToken;
  while (!personalAccessToken) {
    personalAccessToken = prompt("Please enter your GitHub personal access token:");
  }

  let repository;
  while (!repository) {
    repository = prompt("Please enter the repository name to be used:");
  }

  octokit = new octokitModule.Octokit({
    auth: personalAccessToken,
    userAgent: userAgent
  });

  octokit.rest.users.getAuthenticated().then((authResult) => {
    console.log(JSON.stringify(authResult));
    console.log("Logged in to GitHub: %s", authResult.data.login);
    alert("Logged in to GitHub: " + authResult.data.login);

    let playgroundId = getPlaygroundID();
    let pluginDataForPlayground = getPluginDataForPlayground(playgroundId);
    if (!pluginDataForPlayground) {
      gitHubPluginData.experiences.push({
        playgroundId: playgroundId,
        auth: authResult.data,
        personalAccessToken: personalAccessToken,
        repositoryName: repository,
        workspacePath: "workspace.xml"
      });
    } else {
      pluginDataForPlayground.auth = authResult.data;
      pluginDataForPlayground.personalAccessToken = personalAccessToken;
      pluginDataForPlayground.repositoryName = repository;
    }
    storePluginData();
  }).catch((exc) => {
    console.error(exc);
    alert("Failed to setup Repository!");
  });
}

function gitHubPull() {
  if (!isRepoDefined()) {
    askForRepoSetup();
  }
  if (isRepoDefined()) {
    let pluginDataForPlayground = getPluginDataForPlayground(getPlaygroundID());
    if (confirm("Do you really want to reset this workspace to the latest commit of '" + pluginDataForPlayground.repositoryName + "'?")) {
      try {
        octokit = new octokitModule.Octokit({
          auth: pluginDataForPlayground.personalAccessToken,
          userAgent: userAgent
        });
        octokit.rest.repos.getContent({
          mediaType: {
            format: "raw",
          },
          owner: pluginDataForPlayground.auth.login,
          repo: pluginDataForPlayground.repositoryName,
          path: pluginDataForPlayground.workspacePath,
        }).then((workspaceResult) => {
          console.log(JSON.stringify(workspaceResult));
          _Blockly.getMainWorkspace().clear();
          if (!loadFormattedXML(workspaceResult.data)) {
            alert("Failed to import workspace!");
          }
        }).catch((exc) => {
          console.error(exc);
          alert("Failed to load latest workspace!");
        });
      }
      catch (e) {
        console.error(e);
        alert("Failed to import workspace!");
      }
    }
  }
}

function gitHubCommit() {
  if (!isRepoDefined()) {
    askForRepoSetup();
  }
  if (isRepoDefined()) {
    let commitMessage = prompt("Enter commit message:");
    if (commitMessage === null) {
      return;
    } else {
      if (commitMessage.trim() == "") {
        commitMessage = "auto-commit from portal website\n\nChanges:";
        _Blockly.getMainWorkspace().getUndoStack().forEach(element => {
          commitMessage += "\n" + JSON.stringify(element.toJson());
        });
      }
      let pluginDataForPlayground = getPluginDataForPlayground(getPlaygroundID());
      const workspace = _Blockly.getMainWorkspace();
      const workspaceDOM = _Blockly.Xml.workspaceToDom(workspace, true);
      const variablesDOM = _Blockly.Xml.variablesToDom(workspace.getAllVariables());
      const variableElements = variablesDOM.getElementsByTagName("variable");
      //clean up corrupted variables
      for (let index = 0; index < variableElements.length; index++) {
        const element = variableElements[index];
        if (!element.getAttributeNode("type") || element.innerHTML.trim().length == 0) {
          variablesDOM.removeChild(element);
        }
      }
      workspaceDOM.removeChild(workspaceDOM.getElementsByTagName("variables")[0]);
      workspaceDOM.insertBefore(variablesDOM, workspaceDOM.firstChild);
      const workspaceXML = _Blockly.Xml.domToPrettyText(workspaceDOM);

      let contentString = btoa(workspaceXML);

      octokit = new octokitModule.Octokit({
        auth: pluginDataForPlayground.personalAccessToken,
        userAgent: userAgent
      });

      octokit.rest.repos.getContent({
        mediaType: {
          format: "object",
        },
        owner: pluginDataForPlayground.auth.login,
        repo: pluginDataForPlayground.repositoryName
      }).then((result) => {
        console.log(JSON.stringify(result));
        let workspaceFile = result.data.entries.find((entry) => entry.path == pluginDataForPlayground.workspacePath);
        if (workspaceFile) {
          octokit.rest.repos.createOrUpdateFileContents({
            owner: pluginDataForPlayground.auth.login,
            repo: pluginDataForPlayground.repositoryName,
            path: pluginDataForPlayground.workspacePath,
            message: commitMessage,
            content: contentString,
            sha: workspaceFile.sha
          }).then((result1) => {
            let updateResultText = JSON.stringify(result1);
            console.log("Update Result: " + updateResultText);
            alert("Commited: " + result1.data.commit.sha);
          }).catch((exc) => {
            console.error(exc);
            alert("Failed to commit!\n" + JSON.stringify(exc));
          });
        } else {
          octokit.rest.repos.createOrUpdateFileContents({
            owner: pluginDataForPlayground.auth.login,
            repo: pluginDataForPlayground.repositoryName,
            path: pluginDataForPlayground.workspacePath,
            message: commitMessage,
            content: contentString
          }).then((result1) => {
            let updateResultText = JSON.stringify(result1);
            console.log("Update Result: " + updateResultText);
            alert("Commited: " + result1.data.commit.sha);
          }).catch((exc) => {
            console.error(exc);
            alert("Failed to commit!\n" + JSON.stringify(exc));
          });
        }
      }).catch((e) => {
        console.error(e);
        alert("Failed to commit!\n" + JSON.stringify(e));
      });
    }
  }
}

function isRepoDefined() {
  if (!getPluginDataForPlayground(getPlaygroundID())) {
    return false;
  }
  return true;
}


const gitHubSetupItem = {
  displayText: 'GitHub Setup',
  preconditionFn: function (scope) {
    return 'enabled';
  },
  callback: setupRepository,
  scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
  id: 'gitHubSetupItem',
  weight: 180
}

const gitHubPullItem = {
  displayText: 'GitHub Pull',
  preconditionFn: function (scope) {
    if (isRepoDefined()) {
      return 'enabled';
    }
    return 'disabled';
  },
  callback: gitHubPull,
  scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
  id: 'gitHubPullItem',
  weight: 181
}

const gitHubCommitItem = {
  displayText: 'GitHub Commit+Push',
  preconditionFn: function (scope) {
    if (isRepoDefined()) {
      return 'enabled';
    }
    return 'disabled';
  },
  callback: gitHubCommit,
  scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
  id: 'gitHubCommitItem',
  weight: 182
}

initGitHubPlugin().then((result) => {
  _Blockly.ContextMenuRegistry.registry.register(gitHubSetupItem);
  _Blockly.ContextMenuRegistry.registry.register(gitHubPullItem);
  _Blockly.ContextMenuRegistry.registry.register(gitHubCommitItem);
  console.log("GitHub Plugin loaded.");
}).catch((exc) => {
  console.error("Could not load plugin:", exc);
});