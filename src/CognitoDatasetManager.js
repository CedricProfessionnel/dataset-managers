import { EventEmitter } from "events"
import Amplify, { Auth, Storage } from "aws-amplify"
import seamlessImmutable from "seamless-immutable"
const { from: seamless } = seamlessImmutable

class CognitoDatasetManager extends EventEmitter {
  type = "cognito"
  ds = null
  proxyUrl = "https://cors-anywhere.herokuapp.com/"
  constructor({
    authConfig,
    user,
    dataPrivacyLevel = "private",
    privateDataExpire = 24 * 60 * 60,
  } = {}) {
    super()
    if (!authConfig.Auth.region) throw new Error("Auth region is required")
    if (!authConfig.Auth.userPoolId)
      throw new Error("Auth userPoolId is required")
    if (!authConfig.Auth.userPoolWebClientId)
      throw new Error("Auth userPoolWebClientId is required")
    if (!authConfig.Auth.identityPoolId)
      throw new Error("Auth identityPoolId is required")

    if (!authConfig.Storage.AWSS3.bucket)
      throw new Error("Storage bucket name is required")
    if (!authConfig.Storage.AWSS3.region)
      throw new Error("Storage bucket region is required")

    this.authConfig = authConfig
    this.privateDataExpire = privateDataExpire
    this.dataPrivacyLevel = dataPrivacyLevel

    Amplify.configure(this.authConfig)

    this.cognitoSetUp = Auth.signIn(user.username, user.password)
  }

  //Made sure the cognitoSetUp is finish and working
  isReady = async () => {
    await this.cognitoSetUp
      .then(() => {
        this.worked = true
      })
      .catch(() => {
        this.worked = false
      })
    return this.worked
  }
  /*fetchAFile = async (url) => {
    var proxyUrl = "https://cors-anywhere.herokuapp.com/"
    var response
    if (url !== undefined)
      response = await fetch(proxyUrl+ url, {
        method: "GET",
        headers: {
          "X-Requested-With": "xmlhttprequest",
        },
      }).catch((error) => {
        console.log("Looks like there was a problem: \n", error)
      })
    const blob = await response.blob()
    return blob
  }*/

  //get the Summary of the current project
  getSummary = async () => {
    if (!this.ds) {
      var index = await this.getJSON(this.projectName + "/index.json")
      this.ds = seamless({
        summary: {
          samples: await this.getSamplesSummary(),
        },
        interface: index.interface,
        name: this.projectName,
      })
    } else {
      if (!this.ds.summary) {
        this.ds.summary = await this.getSamplesSummary()
      }
    }
    return this.ds.summary
  }

  //get the existing project in the deposit
  getProjects = async () => {
    var list = await Storage.list("", { level: this.dataPrivacyLevel })
    var projets = new Set()

    await Promise.all(
      list.map(async (obj) => {
        if (obj.size) {
          let possibleProjects = obj.key.split("/")[0]
          if (possibleProjects) projets.add(possibleProjects)
        } else {
          if (obj.key.split("/")[0] !== "") {
            projets.add(obj.key.split("/")[0])
          }
        }
      })
    )

    return projets
  }

  /*getDataListFromProject = async ({
    projectName = false,
    noExtensions = false,
  }) => {
    if (!projectName) projectName = this.projectName

    let samples = []
    await Storage.list(`${projectName}/assets/`, {
      level: this.dataPrivacyLevel,
    }).then((result) => {
      samples = result
        .filter((obj) => obj.key !== `${projectName}/data/`)
        .map((obj) => obj.key)
    })
    if (noExtensions) {
      samples = samples.map((eachFile) => {
        return eachFile.replace(/\.[^.]+$/, "")
      })
    }
    return samples
  }*/

  //List the existing samples in the folder samples of the selected project
  getListSamples = async ({ projectName = false }) => {
    if (!projectName) projectName = this.projectName
    var result = await Storage.list(`${projectName}/samples/`, {
      level: this.dataPrivacyLevel,
    })
    let samples = result
      .filter((obj) => obj.key !== `${projectName}/samples/`)
      .map((obj) => obj.key)
    return samples
  }

  //Select a project
  setProject = (projectName) => {
    // This should be moved in a project manager later on
    this.projectName = projectName
  }

  //create the folder of the project and store the index information (dataset first layer of information except samples)
  createProject = async (indexjson) => {
    // This should be moved in a project manager later on
    const projects = await this.getProjects()

    if (projects && !projects.has(indexjson.name)) {
      await Storage.put(`${indexjson.name}/index.json`, indexjson, {
        level: this.dataPrivacyLevel,
        contentType: "application/json",
      })
      return true
    } else {
      console.log("Project with the same name already exist")
      return false
    }
  }

  //Create an array with all the samples annotation json 
  readJSONAllSample = async (listSamples) => {
    var json = new Array(listSamples.length)

    for (var i = 0; i < listSamples.length; i++) {
      json[i] = await this.getJSON(listSamples[i])
    }
    return json
  }

  //get a json regardless of what it contain
  getJSON = async (path) => {
    var url = await Storage.get(path, {
      expires: this.privateDataExpire,
      level: this.dataPrivacyLevel,
      contentType: "application/json",
    })
    var blob = await fetch(url)
    var json = await blob.json()
    return json
  }

  //same as above but it set one
  setJSON = async (path, json) => {
    await Storage.put(path, json, {
      level: this.dataPrivacyLevel,
    }).catch((err) => console.log(err))
  }

  //Load the sample json and verify if exist the annotation or just the other infos
  getSamplesSummary = async () => {
    const listSamples = await this.getListSamples({
      projectName: this.projectName,
      noExtensions: false,
    })
    var json = await this.readJSONAllSample(listSamples)
    const listJson = json.map((obj) => ({
      hasAnnotation: obj.annotation ? true : false,
      _id: obj._id,
      //TODO create fonction to get all url
      _url: obj.imageUrl,
    }))
    return listJson
  }

  //get a property from the summary
  getDatasetProperty = async (key) => {
    if (!this.ds) await this.getSummary()
    return this.ds[key]
  }

  //set any property of the first layer of the json and force datasummary to reset
  setDatasetProperty = async (key, newValue) => {
    switch (key) {
      case "samples":
        await Promise.all(
          newValue.map(async (obj) => {
            await this.setJSON(
              this.projectName + "/samples/" + obj._id + ".json",
              obj
            )
          })
        )
        break
      case "name":
        var dataset = await this.getDataset()
        dataset.name = newValue
        /*var assets=await Promise.all(
          summary.samples.map(async (obj) => {
            return await this.fetchAFile(obj._url)
          })
        )*/
        await this.removeProject(this.projectName),
          await this.setDataset(dataset)
        this.setProject(dataset.name)
        break
      default:
        var path = this.projectName + "/index.json"
        var jsonToChange = await this.getJSON(path)
        jsonToChange[key] = newValue
        await this.setJSON(path, jsonToChange)
        break
    }
    this.ds = undefined
    await this.getSummary()
  }

  /*getDataUrl = async (sampleRefId) => {
    //changer sampleRefId pour avoir aussi l'extension de fichier
    const url = await Storage.get(this.projectName + "/assets/" + sampleRefId, {
      expires: this.privateDataExpire,
      level: this.dataPrivacyLevel,
    })
      .then((_url) => _url)
      .catch((err) => null)

    return url
  }*/


  //IMPORTANT index = the index of the array of samples :::: id = the property _id in a sample of the array

  //get sample by index (the index follows aphabetical order in AWS) 
  //IMPORTANT It can not follow the original order of samples due to AWS ways of listing files 
  getSampleByIndex = async (index) => {
    const sampleRefId = this.ds.summary.samples[index]._id
    let sample = await this.getSample(sampleRefId)
    return sample
  }

  //get sample by id 
  getSample = async (sampleRefId) => {
    var json = await this.getJSON(
      this.projectName + "/samples/" + sampleRefId + ".json"
    )
    return json
  }

  //set sample by id
  setSample = async (sampleRefId, newSample) => {
    await this.setJSON(
      this.projectName + "/samples/" + sampleRefId + ".json",
      newSample
    )
  }

  // This is working but currently not used 
  // NOTE This function is really consumming so be careful
  // Put a file copy in AWS 
  addFile = async (name, blob) => {
    await Storage.put(this.projectName + "/assets/" + name, blob, {
      level: this.dataPrivacyLevel,
    }).catch((err) => console.log(err))
  }

  //add a new samples to existing one or rewrite one already existing 
  addSamples = async (samples) => {
    await Promise.all(
      samples.map(async (obj) => {
        await this.setJSON(
          this.projectName + "/samples/" + obj._id + ".json",
          obj
        )
      })
    )
    //Add assets
  }

  //remove an entire projects and all related files
  removeProject = async (projectName) => {
    var result = await Storage.list(projectName + "/", {
      level: this.dataPrivacyLevel,
    })
    await Promise.all(
      result.map(async (obj) => {
        await Storage.remove(obj.key, {
          level: this.dataPrivacyLevel,
        })
      })
    )
    this.getProjects()
  }

  // remove all samples specified by an array of ids
  removeSamples = async (sampleIds) => {
    var result = await Storage.list(this.projectName + "/samples/", {
      level: this.dataPrivacyLevel,
    })
    await Promise.all(
      result.map(async (obj) => {
        for (var i = 0; i < sampleIds.length; i++) {
          if (obj.key.includes("/" + sampleIds[i] + ".json")) {
            await Storage.remove(obj.key, {
              level: this.dataPrivacyLevel,
            })
          }
        }
        //remove the correponding file
      })
    )
  }

  // set a new dataset by recreating the complete project
  // NOTE Extremely High consumming
  setDataset = async (udtObject) => {
    var index = { name: udtObject.name, interface: udtObject.interface }

    var jsons = udtObject.samples
    /*var assets=await Promise.all(
      summary.samples.map(async (obj) => {
        return await this.fetchAFile(obj._url)
      })
    )*/
    this.setProject(udtObject.name)
    await Promise.all([
      await this.createProject(index),
      await this.addSamples(jsons),
      //await this.addFile()
    ])
  }

  // get the complete dataset by loading all the json
  getDataset = async () => {
    var dataset = await this.getJSON(this.projectName + "/index.json")

    dataset.samples = await this.readJSONAllSample(
      await this.getListSamples(false)
    )

    return dataset
  }
}

export default CognitoDatasetManager
