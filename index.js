const pluginID = "bf2042-portal-github-plugin";
let plugin = {
  manifest: {
    id: pluginID,
    version: "0.0.2"
  }
};
let userAgent = plugin.manifest.id + "/" + plugin.manifest.version;
let octokit;
const defaultExperienceData = {
  playgroundId: "",
  personalAccessToken: "",
  repository: { name: "", owner: "", branch: "", full_name: "" },
  workspacePath: "workspace.xml",
  auth: {},
  commitOnSave: false,
  autoCommit: false,
  autoCommitCount: 30,
  autoCommitEvents: []
}
let gitHubPluginData = {
  experiences: [
    defaultExperienceData
  ],
  version: plugin.manifest.version
}
let changeStack = [];

function loadPluginData() {
  let loadedData = localStorage.getItem(pluginID);
  console.log("GitHubPlugin - loaded plugin data.");
  if (loadedData != null) {
    loadedData = JSON.parse(loadedData);
    if (!loadedData || !loadedData.version == plugin.manifest.version) {
      console.error("GitHub Plugin: invalid plugin data retrieved from storage.");
    } else {
      gitHubPluginData = loadedData;
    }
  }
}

function storePluginData() {
  let pluginDataString = JSON.stringify(gitHubPluginData);
  localStorage.setItem(pluginID, pluginDataString);
  console.log("GitHubPlugin - stored plugin data.");
}

function getPlaygroundID() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("playgroundId")) {
    return params.get("playgroundId");
  }
  return "";
}

function getPluginDataForPlayground(playgroundId) {
  pluginData = gitHubPluginData.experiences.find(el => el.playgroundId == playgroundId);
  if (!pluginData) {
    pluginData = JSON.parse(JSON.stringify(defaultExperienceData));
    pluginData.playgroundId = playgroundId;
    gitHubPluginData.experiences.push(pluginData);
  }
  return pluginData;
}

function getFormattedWorkspaceXML() {
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
  return _Blockly.Xml.domToPrettyText(workspaceDOM);
}

function downloadFile(fileData, fileName) {
  const linkElement = document.createElement("a");
  linkElement.setAttribute("href", fileData);
  linkElement.setAttribute("download", fileName);
  linkElement.style.display = "none";

  document.body.appendChild(linkElement);
  linkElement.click();
  document.body.removeChild(linkElement);
}

function exportWorkspaceXML() {
  const workspaceXML = getFormattedWorkspaceXML();
  const dataUri = `data:application/xml;charset=utf-8,${encodeURIComponent(workspaceXML)}`;
  downloadFile(dataUri, "workspace.xml");
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
    if (getPluginDataForPlayground(getPlaygroundID()).commitOnSave) {
      saveBtn.style.backgroundColor = "#26ffdf";
    } else {
      saveBtn.style.backgroundColor = "";
    }
    saveBtn.onmouseup = saveBtnClicked;
  }
}

function saveBtnClicked(event) {
  if (event.button == 0 && getPluginDataForPlayground(getPlaygroundID()).commitOnSave) {
    gitHubCommit();
  }
}

async function initGitHubPlugin() {
  try {
    plugin = BF2042Portal.Plugins.getPlugin(pluginID);
    userAgent = plugin.manifest.id + "/" + plugin.manifest.version;
  } catch (exception) {
    console.error("Couldn't get plugin data:\n", exception);
  }
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

function showDialogSimple() {
  document.getElementById("github_plugin_modal_backdrop").style.display = "block";
  initSetupDialog();
}
function hideSetupDialog() {
  document.getElementById("github_plugin_modal_backdrop").style.display = "none";
}
function onModalClick(event) {
  if (event.target == document.getElementById('github_plugin_modal_backdrop')) {
    hideSetupDialog();
  }
}

function autoCommitChanged() {
  let autoCommitElement = document.getElementById("github_plugin_modal_autocommit");
  if(autoCommitElement){
    if (!autoCommitElement.checked) {
      document.querySelector("#github_plugin_modal_autocommit_options").style.display = "none";
    } else {
      document.querySelector("#github_plugin_modal_autocommit_options").style.display = "block";
    }
  }
}

function initSetupDialog() {
  document.getElementById("github_plugin_modal_backdrop").addEventListener("click", onModalClick);
  let pluginData = getPluginDataForPlayground(getPlaygroundID());
  document.forms.githubSetup.pat.value = pluginData.personalAccessToken;
  statusIndicatorPat = document.getElementById("status_indicator_pat");
  statusIndicatorPat.innerHTML = "&#8635;";
  statusIndicatorPat.style.color = "#26ffdf";
  statusIndicatorPat.style.cursor = "pointer";
  statusIndicatorPat.addEventListener("click", document.forms.githubSetup.pat.onblur);
  document.forms.githubSetup.repository.value = pluginData.repository.full_name;
  document.forms.githubSetup.repository.innerHTML = '<option value="' + pluginData.repository.owner + ";" + pluginData.repository.name + ";" + pluginData.repository.full_name + '">' + pluginData.repository.full_name + '</option>';
  document.forms.githubSetup.repository.disabled = true;
  document.forms.githubSetup.branch.value = pluginData.repository.branch;
  document.forms.githubSetup.branch.innerHTML = '<option value="' + pluginData.repository.branch + '">' + pluginData.repository.branch + '</option>';
  document.forms.githubSetup.branch.disabled = true;
  document.forms.githubSetup.commitOnSave.checked = pluginData.commitOnSave;
  document.forms.githubSetup.autoCommit.checked = pluginData.autoCommit;
  document.forms.githubSetup.autoCommitCount.value = pluginData.autoCommitCount;
  document.getElementById("BLOCK_ALL").checked = false;
  document.getElementById("COMMENT_ALL").checked = false;
  document.getElementById("VAR_ALL").checked = false;
  document.querySelectorAll(".blockEvent").forEach(element => {
    element.checked = false;
  });
  document.querySelectorAll(".commentEvent").forEach(element => {
    element.checked = false;
  });
  document.querySelectorAll(".varEvent").forEach(element => {
    element.checked = false;
  });
  pluginData.autoCommitEvents.forEach(element => {
    document.getElementById(element).checked = true;
    if(element.startsWith("BLOCK")){
      document.getElementById("BLOCK_ALL").checked = true;
    }else if(element.startsWith("COMMENT")){
      document.getElementById("COMMENT_ALL").checked = true;
    }else if(element.startsWith("VAR")){
      document.getElementById("VAR_ALL").checked = true;
    }
  });
  autoCommitChanged();
}


function toggleChangeEventsDisplay() {
  let autoCommitEventsPanel = document.getElementById('github_plugin_autocommit_events');
  let collapsibleSymbold = document.getElementById('github_plugin_collapsible_symbol');
  if (autoCommitEventsPanel.style.display == "none" || autoCommitEventsPanel.style.display == "") {
    autoCommitEventsPanel.style.display = "block";
    collapsibleSymbold.innerHTML = "&#8722;";
  } else {
    autoCommitEventsPanel.style.display = "none";
    collapsibleSymbold.innerHTML = "&#43;";
  }
}

function showSetupDialog() {
  const styleElement = document.createElement("style");
  styleElement.setAttribute("type", "text/css");
  styleElement.innerHTML = `.github_plugin_modal_backdrop {display: block;position: fixed;z-index: 1;left: 0;top: 0;width: 100%;height: 100%;overflow: auto;background-color: rgb(0, 0, 0);background-color: rgba(0, 0, 0, 0.4);}.github_plugin_modal {background-color: #424242;color: #fff;margin: 15% auto;/*width: 80%;*/width: 400px;}.github_plugin_modal_content {padding: 10px;font-size: 16px;color: #fff;line-height: 36px;}#github_plugin_modal_autocommit_options {padding-left: 25px;}#github_plugin_modal_autocommit_changes {width: 60px;}#github_plugin_modal_collapsible_events {cursor: pointer;}#github_plugin_autocommit_events {display: none;line-height: normal;}label {line-height: normal;color: #fff;}ul,li {margin-top: 0px;list-style: none;}br {line-height: normal;}.github_plugin_modal_button_pane {padding: 10px;text-align: center;}.github_plugin_modal_button {cursor: pointer;text-align: center;vertical-align: baseline;min-width: 164px;line-height: 36px;padding: 3px 10px;text-transform: uppercase;color: #fff;background-color: #999;border-radius: 0;border: none;box-sizing: border-box;font-weight: bold;font-size: 18px;margin: 3px;}.github_plugin_modal_button:hover {color: #000;background-color: #26ffdf;}.github_plugin_modal_button:active {color: #fff;background-color: #26ffdf;}.github_plugin_modal_header {background-color: #26ffdf;color: #000;padding: 10px;}.github_plugin_modal_title {background-color: #26ffdf;color: #000;text-transform: uppercase;font-weight: bold;font-size: 20px;}.github_plugin_modal_close {color: #000;float: right;font-size: 20px;font-weight: bold;}.github_plugin_modal_close:hover,.github_plugin_modal_close:focus {color: #fff;text-decoration: none;cursor: pointer;}.github_plugin_loader {display: inline-block;border: 6px solid #999;border-radius: 50%;border-top: 6px solid #26ffdf;width: 10px;height: 10px;animation: github_plugin_spinner 1s linear infinite;}@keyframes github_plugin_spinner {0% {transform: rotate(0deg);}100% {transform: rotate(360deg);}}`;
  document.head.appendChild(styleElement);
  let modalDialog = document.getElementById("github_plugin_modal_backdrop");
  if (modalDialog) {
    document.body.removeChild(modalDialog);
  }
  modalDialog = document.createElement("div");
  modalDialog.setAttribute("class", "github_plugin_modal_backdrop");
  modalDialog.setAttribute("id", "github_plugin_modal_backdrop");
  modalDialog.innerHTML = `<div class="github_plugin_modal"><div class="github_plugin_modal_header"><span class="github_plugin_modal_title">GitHub Setup</span><span class="github_plugin_modal_close" onclick="hideSetupDialog()">X</span></div><div class="github_plugin_modal_content"><form id="githubSetup"><table width="100%"><tr><td><label for="github_plugin_modal_pat">Personal Access Token</label></td><td></td></tr><tr><td><input type="password" id="github_plugin_modal_pat" name="pat" placeholder="Personal Access Token" onblur="patChanged()"/><input type="hidden" id="github_plugin_modal_pat_user" name="user"/></td><td><div id="status_indicator_pat" class="statusIndicator"></div></td></tr><tr><td><label for="github_plugin_modal_repository">Repository Name</label></td><td></td></tr><tr><td><select id="github_plugin_modal_repository" name="repository" disabled><option value="select">Please select...</option></select></td><td><div id="status_indicator_repository" class="statusIndicator"></div></td></tr><tr><td><label for="github_plugin_modal_branch">Branch</label><br/></td><td></td></tr><tr><td><select id="github_plugin_modal_branch" name="branch" disabled><option value="select">Please select...</option></select></td><td><div id="status_indicator_branch" class="statusIndicator"></div></td></tr></table><input type="checkbox" id="github_plugin_modal_commitOnSave" name="commitOnSave" checked="true" /><label for="github_plugin_modal_commitOnSave">Commit on Save</label><br /><input type="checkbox" id="github_plugin_modal_autocommit" name="autoCommit" onchange="autoCommitChanged()" checked="true" /><label for="github_plugin_modal_autocommit">Auto Commit</label><br /><div id="github_plugin_modal_autocommit_options"><label for="github_plugin_modal_autocommit_count">Commit after</label><input type="number" value="25" size="4" maxlength="4" min="1" max="9999"                            id="github_plugin_modal_autocommit_count" name="autoCommitCount" /> changes                        <br /><span id="github_plugin_modal_collapsible_events" onclick="toggleChangeEventsDisplay()"><b id="github_plugin_collapsible_symbol">&#43;</b> Changes to consider                        </span><br /><div id="github_plugin_autocommit_events"><input type="checkbox" id="BLOCK_ALL" name="BLOCK_ALL" value="BLOCK_ALL" checked onchange="toggleBlockEvents()"/><label for="BLOCK_ALL">Blocks</label><ul><li><input type="checkbox" id="BLOCK_CHANGE" name="BLOCK_CHANGE" value="BLOCK_CHANGE" checked class="blockEvent"/><label for="BLOCK_CHANGE">Change</label></li><li><input type="checkbox" id="BLOCK_CREATE" name="BLOCK_CREATE" value="BLOCK_CREATE" checked class="blockEvent" /><label for="BLOCK_CREATE">Create</label></li><li><input type="checkbox" id="BLOCK_DELETE" name="BLOCK_DELETE" value="BLOCK_DELETE" checked class="blockEvent" /><label for="BLOCK_DELETE">Delete</label></li><li><input type="checkbox" id="BLOCK_DRAG" name="BLOCK_DRAG" value="BLOCK_DRAG" checked class="blockEvent" /><label for="BLOCK_DRAG">Drag</label></li><li><input type="checkbox" id="BLOCK_MOVE" name="BLOCK_MOVE" value="BLOCK_MOVE" checked class="blockEvent" /><label for="BLOCK_MOVE">Move</label></li></ul><input type="checkbox" id="COMMENT_ALL" name="COMMENT_ALL" value="COMMENT_ALL" checked onchange="toggleCommentEvents()"/><label for="COMMENT_ALL">Comments</label><ul><li><input type="checkbox" id="COMMENT_CHANGE" name="COMMENT_CHANGE" value="COMMENT_CHANGE" checked class="commentEvent" /><label for="COMMENT_CHANGE">Change</label></li><li><input type="checkbox" id="COMMENT_CREATE" name="COMMENT_CREATE" value="COMMENT_CREATE" checked class="commentEvent" /><label for="COMMENT_CREATE">Create</label></li><li><input type="checkbox" id="COMMENT_DELETE" name="COMMENT_DELETE" value="COMMENT_DELETE" checked class="commentEvent" /><label for="COMMENT_DELETE">Delete</label></li><li><input type="checkbox" id="COMMENT_MOVE" name="COMMENT_MOVE" value="COMMENT_MOVE" checked class="commentEvent" /><label for="COMMENT_MOVE">Move</label></li></ul><input type="checkbox" id="VAR_ALL" name="VAR_ALL" value="VAR_ALL" checked onchange="toggleVarEvents()" /><label for="VAR_ALL">Variables</label><ul><li><input type="checkbox" id="VAR_CREATE" name="VAR_CREATE" value="VAR_CREATE" checked class="varEvent" /><label for="VAR_CREATE">Create</label></li><li><input type="checkbox" id="VAR_DELETE" name="VAR_DELETE" value="VAR_DELETE" checked class="varEvent"/><label for="VAR_DELETE">Delete</label></li><li><input type="checkbox" id="VAR_RENAME" name="VAR_RENAME" value="VAR_RENAME" checked class="varEvent" /><label for="VAR_RENAME">Rename</label></li></ul></div></div></form></div><div class="github_plugin_modal_button_pane"><input type="button" class="github_plugin_modal_button" value="Cancel" onclick="hideSetupDialog()" /><input type="button" class="github_plugin_modal_button" value="Ok" onclick="setupDialogConfirmed()" /></div></div>`;
  document.body.appendChild(modalDialog);

  initSetupDialog();
  modalDialog.style.display = "block";
}

function setStatusIndicatorLoading(indicatorElement) {
  indicatorElement.innerHTML = "";
  indicatorElement.removeAttribute("class");
  indicatorElement.removeAttribute("style");
  indicatorElement.setAttribute("class", "github_plugin_loader");
  indicatorElement.removeEventListener("click", document.forms.githubSetup.pat.onblur);
}

function setStatusIndicatorFailure(indicatorElement) {
  indicatorElement.innerHTML = "";
  indicatorElement.removeAttribute("class");
  indicatorElement.removeAttribute("style");
  indicatorElement.setAttribute("style", "color:#f00; display: inline-block;");
  indicatorElement.removeEventListener("click", document.forms.githubSetup.pat.onblur);
  indicatorElement.innerHTML = "&cross;";
}

function setStatusIndicatorSuccess(indicatorElement) {
  indicatorElement.innerHTML = "";
  indicatorElement.removeAttribute("class");
  indicatorElement.removeAttribute("style");
  indicatorElement.setAttribute("style", "color:#26ffdf; display: inline-block;");
  indicatorElement.removeEventListener("click", document.forms.githubSetup.pat.onblur);
  indicatorElement.innerHTML = "&check;";
}

function patChanged() {
  let personalAccessToken = document.forms.githubSetup.pat.value;
  if (!personalAccessToken || personalAccessToken.length == 0) {
    return;
  }
  setStatusIndicatorLoading(document.getElementById('status_indicator_pat'));
  octokit = new octokitModule.Octokit({
    auth: personalAccessToken,
    userAgent: userAgent
  });

  octokit.rest.users.getAuthenticated().then((authResult) => {
    console.log(JSON.stringify(authResult));
    console.log("Logged in to GitHub: %s", authResult.data.login);
    document.forms.githubSetup.user.value = authResult.data.login;
    setStatusIndicatorSuccess(document.getElementById('status_indicator_pat'));
    getRepos();
  }).catch((exc) => {
    console.error(exc);
    setStatusIndicatorFailure(document.getElementById('status_indicator_pat'));
  });
}

function getRepos() {
  setStatusIndicatorLoading(document.getElementById('status_indicator_repository'));
  octokit.request('GET /user/repos', {}).then((repoResult) => {
    setStatusIndicatorSuccess(document.getElementById('status_indicator_repository'));
    document.forms.githubSetup.repository.innerHTML = "";
    let repoOption = document.createElement("option");
    repoOption.setAttribute("value", "select");
    repoOption.innerHTML = "Please select...";
    document.forms.githubSetup.repository.appendChild(repoOption);
    repoResult.data.forEach((repo) => {
      repoOption = document.createElement("option");
      repoOption.setAttribute("value", repo.owner.login + ";" + repo.name + ";" + repo.full_name);
      repoOption.innerHTML = repo.full_name;
      document.forms.githubSetup.repository.appendChild(repoOption);
    });
    document.forms.githubSetup.repository.disabled = false;
    document.forms.githubSetup.repository.addEventListener("change", getBranches);
  }).catch((exc) => {
    setStatusIndicatorFailure(document.getElementById('status_indicator_repository'));
  });
}

function getBranches() {
  setStatusIndicatorLoading(document.getElementById('status_indicator_branch'));
  octokit.request('GET /repos/{owner}/{repo}/branches', {
    owner: document.forms.githubSetup.repository.value.split(";", 1)[0],
    repo: document.forms.githubSetup.repository.value.split(";", 2)[1]
  }).then((branchResult) => {
    setStatusIndicatorSuccess(document.getElementById('status_indicator_branch'));
    document.forms.githubSetup.branch.innerHTML = "";
    let branchOption = document.createElement("option");
    branchOption.setAttribute("value", "select");
    branchOption.innerHTML = "Please select...";
    document.forms.githubSetup.branch.appendChild(branchOption);
    branchResult.data.forEach((branch) => {
      branchOption = document.createElement("option");
      branchOption.setAttribute("value", branch.name);
      branchOption.innerHTML = branch.name;
      document.forms.githubSetup.branch.appendChild(branchOption);
    });
    document.forms.githubSetup.branch.disabled = false;

  }).catch((exc) => {
    console.error(exc);
    setStatusIndicatorFailure(document.getElementById('status_indicator_branch'));
  });
}

function isSetupDataValid() {
  let githubSetup = document.forms.githubSetup;
  if (!githubSetup.pat.value || !githubSetup.pat.value.length > 0) {
    return false;
  }
  if (githubSetup.repository.value && githubSetup.repository.value.length > 0) {
    let repoDetails = githubSetup.repository.value.split(";");
    if (!(repoDetails.length == 3)) {
      return false;
    }
  } else {
    return false;
  }
  if (!githubSetup.branch.value || !githubSetup.branch.value.length > 0 || githubSetup.branch.value == "select") {
    return false;
  }
  return true;
}

function setupDialogConfirmed() {
  if (isSetupDataValid()) {
    let githubSetup = document.forms.githubSetup;
    let pluginData = getPluginDataForPlayground(getPlaygroundID());
    pluginData.personalAccessToken = githubSetup.pat.value;
    let repoDetails = githubSetup.repository.value.split(";", 3);
    pluginData.repository.owner = repoDetails[0];
    pluginData.repository.name = repoDetails[1];
    pluginData.repository.full_name = repoDetails[2];
    pluginData.repository.branch = githubSetup.branch.value;
    pluginData.commitOnSave = githubSetup.commitOnSave.checked;
    pluginData.autoCommit = githubSetup.autoCommit.checked;
    if (pluginData.autoCommit) {
      pluginData.autoCommitCount = githubSetup.autoCommitCount.value;
      pluginData.autoCommitEvents = [];
      document.querySelectorAll(".blockEvent").forEach(element => {
        if (element.checked) {
          pluginData.autoCommitEvents.push(element.value);
        }
      });
      document.querySelectorAll(".commentEvent").forEach(element => {
        if (element.checked) {
          pluginData.autoCommitEvents.push(element.value);
        }
      });
      document.querySelectorAll(".varEvent").forEach(element => {
        if (element.checked) {
          pluginData.autoCommitEvents.push(element.value);
        }
      });
    }
    storePluginData();
    hideSetupDialog();
    highlightSaveBtn();
  } else {
    alert("Setup data is missing or incorrect.");
  }


}

function toggleBlockEvents() {
  const toggle = document.getElementById("BLOCK_ALL");
  document.querySelectorAll(".blockEvent").forEach((blockEvent) => {
    blockEvent.checked = toggle.checked;
  });
}
function toggleCommentEvents() {
  const toggle = document.getElementById("COMMENT_ALL");
  document.querySelectorAll(".commentEvent").forEach((blockEvent) => {
    blockEvent.checked = toggle.checked;
  });
}
function toggleVarEvents() {
  const toggle = document.getElementById("VAR_ALL");
  document.querySelectorAll(".varEvent").forEach((blockEvent) => {
    blockEvent.checked = toggle.checked;
  });
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

      let contentString = btoa(getFormattedWorkspaceXML());

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
            branch: pluginDataForPlayground.branch,
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
            branch: pluginDataForPlayground.branch,
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
  let pluginData = getPluginDataForPlayground(getPlaygroundID());
  if (!pluginData.repository.owner) {
    return false;
  }
  return true;
}

function gitHubExportItem() {
  const gitHubSetupItem = {
    displayText: 'Export formatted XML',
    preconditionFn: function (scope) {
      return 'enabled';
    },
    callback: exportWorkspaceXML,
    scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
    id: 'gitHubExportItem',
    weight: 180
  }
  return gitHubSetupItem;
}

function gitHubImportItem() {
  const gitHubSetupItem = {
    displayText: 'Import formatted XML',
    preconditionFn: function (scope) {
      return 'enabled';
    },
    callback: setupRepository,
    scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
    id: 'gitHubImportItem',
    weight: 181
  }
  return gitHubSetupItem;
}

function gitHubSetupItem() {
  const gitHubSetupItem = {
    displayText: 'GitHub Setup',
    preconditionFn: function (scope) {
      return 'enabled';
    },
    callback: showSetupDialog,
    scopeType: _Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
    id: 'gitHubSetupItem',
    weight: 182
  }
  return gitHubSetupItem;
}

function gitHubPullItem() {
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
    weight: 183
  }

  return gitHubPullItem;
}

function gitHubCommitItem() {
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
    weight: 184
  }
  return gitHubCommitItem;
}


initGitHubPlugin().then((result) => {
  try {
    _Blockly.ContextMenuRegistry.registry.register(gitHubSetupItem());
    _Blockly.ContextMenuRegistry.registry.register(gitHubPullItem());
    _Blockly.ContextMenuRegistry.registry.register(gitHubCommitItem());
    console.log("GitHub Plugin loaded.");
  } catch (exception) {
    console.error("could not register blockly menu items\n", exception);
  }
}).catch((exc) => {
  console.error("Could not load plugin:", exc);
});