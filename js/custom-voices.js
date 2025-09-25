
$(function() {
  getSettings(["awsCreds", "gcpCreds", "ibmCreds", "azureCreds"])
    .then(function(items) {
      if (items.awsCreds) {
        $("#aws-access-key-id").val(obfuscate(items.awsCreds.accessKeyId));
        $("#aws-secret-access-key").val(obfuscate(items.awsCreds.secretAccessKey));
      }
      if (items.gcpCreds) {
        $("#gcp-api-key").val(obfuscate(items.gcpCreds.apiKey));
        $("#gcp-enable-studio").prop('checked', items.gcpCreds.enableStudio);
      }
      if (items.ibmCreds) {
        $("#ibm-api-key").val(obfuscate(items.ibmCreds.apiKey));
        $("#ibm-url").val(obfuscate(items.ibmCreds.url));
      }
      if (items.azureCreds) {
        $("#azure-region").val(items.azureCreds.region)
        $("#azure-key").val(obfuscate(items.azureCreds.key))
      }
    })
  $(".status").hide();
  $("#aws-save-button").click(awsSave);
  $("#gcp-save-button").click(gcpSave);
  $("#ibm-save-button").click(ibmSave);
  $("#azure-save-button").click(azureSave)
})

function obfuscate(key) {
  return key.replace(/./g, function(m, i) {
    return i < key.length-5 ? "*" : m;
  })
}


function awsSave() {
  $(".status").hide();
  var accessKeyId = $("#aws-access-key-id").val().trim();
  var secretAccessKey = $("#aws-secret-access-key").val().trim();
  if (accessKeyId && secretAccessKey) {
    $("#aws-progress").show();
    testAws(accessKeyId, secretAccessKey)
      .then(function() {
        $("#aws-progress").hide();
        updateSettings({awsCreds: {accessKeyId: accessKeyId, secretAccessKey: secretAccessKey}});
        $("#aws-success").text("Amazon Polly voices are enabled.").show();
        $("#aws-access-key-id").val(obfuscate(accessKeyId));
        $("#aws-secret-access-key").val(obfuscate(secretAccessKey));
      },
      function(err) {
        $("#aws-progress").hide();
        $("#aws-error").text("Test failed: " + err.message).show();
      })
  }
  else if (!accessKeyId && !secretAccessKey) {
    clearSettings(["awsCreds"])
      .then(function() {
        $("#aws-success").text("Amazon Polly voices are disabled.").show();
      })
  }
  else {
    $("#aws-error").text("Missing required fields.").show();
  }
}

function testAws(accessKeyId, secretAccessKey) {
      var polly = new AWS.Polly({
        region: "us-east-1",
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      })
      return polly.describeVoices().promise();
}


function gcpSave() {
  $(".status").hide();
  var apiKey = $("#gcp-api-key").val().trim();
  var enableStudio = $("#gcp-enable-studio").is(':checked');
  if (apiKey) {
    $("#gcp-progress").show();
    testGcp(apiKey)
      .then(function() {
        $("#gcp-progress").hide();
        updateSettings({gcpCreds: {apiKey: apiKey, enableStudio: enableStudio}});
        if (enableStudio) {
          $("#gcp-success").text("Google Wavenet & Studio voices are enabled.").show();
        } else {
          $("#gcp-success").text("Google Wavenet voices are enabled.").show();
        }
        $("#gcp-api-key").val(obfuscate(apiKey));
      },
      function(err) {
        $("#gcp-progress").hide();
        $("#gcp-error").text("Test failed: " + err.message).show();
      })
  }
  else {
    clearSettings(["gcpCreds"])
      .then(function() {
        $("#gcp-success").text("Google Wavenet voices are disabled.").show();
      })
  }
}

function testGcp(apiKey) {
      return ajaxGet("https://texttospeech.googleapis.com/v1beta1/voices?key=" + apiKey);
}


function ibmSave() {
  $(".status").hide();
  var apiKey = $("#ibm-api-key").val().trim();
  var url = $("#ibm-url").val().trim();
  if (apiKey && url) {
    $("#ibm-progress").show();
    testIbm(apiKey, url)
      .then(function() {
        $("#ibm-progress").hide();
        updateSettings({ibmCreds: {apiKey: apiKey, url: url}});
        $("#ibm-success").text("IBM Watson voices are enabled.").show();
        $("#ibm-api-key").val(obfuscate(apiKey));
        $("#ibm-url").val(obfuscate(url));
      },
      function(err) {
        $("#ibm-progress").hide();
        $("#ibm-error").text("Test failed: " + err.message).show();
      })
  }
  else if (!apiKey && !url) {
    clearSettings(["ibmCreds"])
      .then(function() {
        $("#ibm-success").text("IBM Watson voices are disabled.").show();
      })
  }
  else {
    $("#ibm-error").text("Missing required fields.").show();
  }
}

function testIbm(apiKey, url) {
  return brapi.permissions.request({origins: [url + "/*"]})
    .then(function(granted) {
      if (!granted) throw new Error("Permission not granted");
    })
    .then(function() {
      return ibmWatsonTtsEngine.fetchVoices(apiKey, url);
    })
}


async function azureSave() {
  $(".status").hide()
  const region = $("#azure-region").val().trim()
  const key = $("#azure-key").val().trim()
  if (region && key) {
    $("#azure-progress").show()
    try {
      await testAzure(region, key)
      await updateSettings({azureCreds: {region, key}})
      $("#azure-success").text("Azure voices are enabled.").show()
      $("#azure-key").val(obfuscate(key))
    }
    catch (err) {
      $("#azure-error").text("Test failed: " + err.message).show()
    }
    finally {
      $("#azure-progress").hide()
    }
  }
  else if (!region && !key) {
    await clearSettings(["azureCreds"])
    $("#azure-success").text("IBM Watson voices are disabled.").show()
  }
  else {
    $("#azure-error").text("Missing required fields.").show()
  }
}

async function testAzure(region, key) {
  await azureTtsEngine.fetchVoices(region, key)
}



//OpenAI
$(function() {
  const $card = $(".openai")
  if (!$card.length) return

  const creds$ = observeSetting("openaiCreds")
  const editMode$ = new rxjs.BehaviorSubject(false)
  const status$ = new rxjs.BehaviorSubject({type: "IDLE"})
  const listStatus$ = new rxjs.BehaviorSubject({type: "IDLE"})

  const $modelSelect = $card.find(".sel-model")
  const $voicesSelect = $card.find(".sel-voices")

  $card.find(".status").hide()
  $card.find(".list-status").hide()

  let currentCreds = null
  let availableModels = []
  let availableVoices = []
  let selectedModelId = ""
  let selectedVoiceIds = []

  rxjs.combineLatest(creds$, editMode$).subscribe(([creds, editMode]) => {
    $card.find(".view-new").toggle(creds == null && !editMode)
    $card.find(".view-exist").toggle(creds != null && !editMode)
    $card.find(".view-edit").toggle(editMode)
    if (editMode) {
      if ($modelSelect.children().length == 0) renderModelSelect()
      if ($voicesSelect.children().length == 0) renderVoiceSelect()
    }
  })

  creds$.subscribe(creds => {
    currentCreds = creds || null
    if (!creds) {
      availableModels = []
      availableVoices = []
    }
    const endpointUrl = creds && creds.url || openaiTtsEngine.defaultEndpointUrl
    const apiKey = creds && creds.apiKey || ""
    const model = creds && creds.model || ""
    const modelName = creds && creds.modelName || model
    const voiceList = creds ? (creds.voiceList || openaiTtsEngine.defaultVoiceList) : []
    selectedModelId = model
    selectedVoiceIds = voiceList.map(item => item.voice)

    $card.find(".endpoint-url").text(endpointUrl)
    $card.find(".api-key").text(apiKey && (apiKey.slice(0,13) + "*****" + apiKey.slice(-5)))
    $card.find(".model").text(modelName || "")
    $card.find(".voice-list").text(voiceList.map(x => x.name || x.voice).join(", "))

    $card.find(".txt-endpoint-url").val(endpointUrl)
    $card.find(".txt-api-key").val(apiKey)

    renderModelSelect()
    renderVoiceSelect()
  })

  status$.subscribe(status => {
    $card.find(".status.progress").toggle(status.type == "PROGRESS")
    $card.find(".status.error").toggle(status.type == "ERROR")
      .text(status.type == "ERROR" ? status.error.message : "")
  })

  listStatus$.subscribe(status => {
    $card.find(".list-status.progress").toggle(status.type == "PROGRESS")
    $card.find(".list-status.error").toggle(status.type == "ERROR")
      .text(status.type == "ERROR" ? status.error.message : "")
  })

  $card.find(".btn-add").click(() => {
    status$.next({type: "IDLE"})
    listStatus$.next({type: "IDLE"})
    editMode$.next(true)
    maybeLoadLists()
  })

  $card.find(".btn-edit").click(() => {
    status$.next({type: "IDLE"})
    listStatus$.next({type: "IDLE"})
    editMode$.next(true)
    maybeLoadLists()
  })

  $card.find(".btn-delete").click(() => {
    clearSettings(["openaiCreds"])
    editMode$.next(false)
  })

  $card.find(".btn-refresh").click(() => {
    loadLists(true)
  })

  $modelSelect.on("change", () => {
    selectedModelId = $modelSelect.val() || ""
  })

  $voicesSelect.on("change", () => {
    selectedVoiceIds = $voicesSelect.val() || []
  })

  $card.find(".btn-save").click(async () => {
    try {
      const url = normalizeEndpoint(($card.find(".txt-endpoint-url").val() || "").trim() || openaiTtsEngine.defaultEndpointUrl)
      const apiKey = ($card.find(".txt-api-key").val() || "").trim()
      const modelId = selectedModelId || inferDefaultModelId()
      const modelMeta = findModel(modelId)
      if (!modelId) throw new Error("Select an OpenAI model.")
      if (!selectedVoiceIds.length) throw new Error("Select at least one OpenAI voice.")

      const voiceList = buildVoiceList(modelId)

      const openaiCreds = {
        url,
        apiKey,
        model: modelId,
        modelName: modelMeta && (modelMeta.name || modelMeta.id || modelMeta.model_id || modelId) || modelId,
        voiceList,
      }

      status$.next({type: "PROGRESS"})
      await openaiTtsEngine.test(openaiCreds)
      await updateSettings({openaiCreds})
      status$.next({type: "IDLE"})
      editMode$.next(false)
    }
    catch (err) {
      status$.next({type: "ERROR", error: err})
    }
  })

  $card.find(".btn-cancel").click(() => {
    editMode$.next(false)
  })

  function maybeLoadLists() {
    const apiKey = ($card.find(".txt-api-key").val() || "").trim()
    if (apiKey && !availableModels.length && !availableVoices.length) {
      loadLists(false)
    }
  }

  async function loadLists(force) {
    const url = normalizeEndpoint(($card.find(".txt-endpoint-url").val() || "").trim() || openaiTtsEngine.defaultEndpointUrl)
    const apiKey = ($card.find(".txt-api-key").val() || "").trim()
    if (!apiKey) {
      if (force) listStatus$.next({type: "ERROR", error: new Error("Provide an OpenAI API key to load models and voices.")})
      return
    }

    listStatus$.next({type: "PROGRESS"})
    try {
      const [models, voices] = await Promise.all([
        openaiTtsEngine.fetchModels(apiKey, url),
        openaiTtsEngine.fetchVoices(apiKey, url)
      ])
      availableModels = Array.isArray(models) ? models : []
      availableVoices = Array.isArray(voices) ? voices : []
      if (!selectedModelId) {
        const inferred = inferDefaultModelId()
        if (inferred) selectedModelId = inferred
      }
      renderModelSelect()
      renderVoiceSelect()
      listStatus$.next({type: "IDLE"})
    }
    catch (err) {
      listStatus$.next({type: "ERROR", error: err})
    }
  }

  function renderModelSelect() {
    const select = $modelSelect.empty()
    const models = availableModels.length ? availableModels : buildFallbackModels()
    if (!models.length) {
      select.append($("<option>").val("").text("No data – use Reload to fetch models"))
      select.prop("disabled", true)
      return
    }
    select.prop("disabled", false)
    models.forEach(model => {
      const id = model.id || model.model_id || model
      const label = model.name || model.display_name || model.id || model.model_id || model
      $("<option>").val(id).text(label).appendTo(select)
    })
    if (selectedModelId && models.some(model => (model.id || model.model_id || model) == selectedModelId)) {
      select.val(selectedModelId)
    } else {
      selectedModelId = select.val() || ""
    }
  }

  function renderVoiceSelect() {
    const select = $voicesSelect.empty()
    const voices = availableVoices.length ? availableVoices : buildFallbackVoices()
    if (!voices.length) {
      select.append($("<option>").val("").text("No data – use Reload to fetch voices"))
      select.prop("disabled", true)
      return
    }
    select.prop("disabled", false)
    voices.forEach(voice => {
      const id = extractVoiceId(voice)
      const name = voice.name || voice.displayName || voice.voice || id
      const lang = getVoiceLang(voice)
      const label = lang ? `${name} (${lang})` : name
      $("<option>").val(id).text(label).appendTo(select)
    })
    if (!selectedVoiceIds.length && voices.length) {
      selectedVoiceIds = [extractVoiceId(voices[0])]
    }
    select.val(selectedVoiceIds)
  }

  function buildFallbackModels() {
    if (currentCreds && currentCreds.model) {
      return [{id: currentCreds.model, name: currentCreds.modelName || currentCreds.model}]
    }
    const defaults = openaiTtsEngine.defaultVoiceList || []
    const unique = new Map()
    defaults.forEach(item => {
      if (item.model) unique.set(item.model, {id: item.model, name: item.model})
    })
    return Array.from(unique.values())
  }

  function buildFallbackVoices() {
    const list = (currentCreds && currentCreds.voiceList) || openaiTtsEngine.defaultVoiceList
    return list.map(item => ({
      voice: item.voice,
      name: item.name || item.voice,
      lang: item.lang,
      instructions: item.instructions,
    }))
  }

  function buildVoiceList(modelId) {
    const voicesById = new Map()
    availableVoices.forEach(voice => voicesById.set(extractVoiceId(voice), voice))
    if (currentCreds && currentCreds.voiceList) {
      currentCreds.voiceList.forEach(item => {
        if (!voicesById.has(item.voice)) {
          voicesById.set(item.voice, {
            voice: item.voice,
            name: item.name || item.voice,
            lang: item.lang,
            instructions: item.instructions,
          })
        }
      })
    }
    return selectedVoiceIds.map(id => {
      const voice = voicesById.get(id) || {voice: id}
      const existing = currentCreds && currentCreds.voiceList && currentCreds.voiceList.find(item => item.voice == id)
      return {
        voice: id,
        name: voice.name || voice.displayName || voice.voice || id,
        lang: getVoiceLang(voice) || (existing && existing.lang) || "pl-PL",
        model: modelId,
        instructions: existing && existing.instructions || voice.instructions || "",
      }
    })
  }

  function findModel(id) {
    return availableModels.find(model => (model.id || model.model_id || model) == id)
      || (currentCreds && currentCreds.model && (currentCreds.model == id ? {name: currentCreds.modelName || id, id} : null))
      || null
  }

  function getVoiceLang(voice) {
    return voice.lang
      || voice.language
      || voice.locale
      || (voice.labels && (voice.labels.language || voice.labels.language_code))
      || voice.language_code
  }

  function normalizeEndpoint(url) {
    return url.replace(/\/$/, "")
  }

  function extractVoiceId(voice) {
    return voice.voice_id || voice.id || voice.voice || voice.name
  }

  function inferDefaultModelId() {
    if (selectedModelId) return selectedModelId
    if (currentCreds && currentCreds.model) return currentCreds.model
    const fallbackModels = buildFallbackModels()
    return fallbackModels.length ? (fallbackModels[0].id || fallbackModels[0].model || fallbackModels[0]) : ""
  }
})

//ElevenLabs
$(function() {
  const $card = $(".elevenlabs")
  if (!$card.length) return

  const creds$ = observeSetting("elevenlabsCreds")
  const editMode$ = new rxjs.BehaviorSubject(false)
  const status$ = new rxjs.BehaviorSubject({type: "IDLE"})
  const listStatus$ = new rxjs.BehaviorSubject({type: "IDLE"})

  const $modelSelect = $card.find(".sel-model")
  const $voicesSelect = $card.find(".sel-voices")

  $card.find(".status").hide()
  $card.find(".list-status").hide()

  let currentCreds = null
  let availableModels = []
  let availableVoices = []
  let selectedModelId = ""
  let selectedVoiceIds = []

  rxjs.combineLatest(creds$, editMode$).subscribe(([creds, editMode]) => {
    $card.find(".view-new").toggle(creds == null && !editMode)
    $card.find(".view-exist").toggle(creds != null && !editMode)
    $card.find(".view-edit").toggle(editMode)
    if (editMode) {
      if ($modelSelect.children().length == 0) renderModelSelect()
      if ($voicesSelect.children().length == 0) renderVoiceSelect()
    }
  })

  creds$.subscribe(creds => {
    currentCreds = creds || null
    if (!creds) {
      availableModels = []
      availableVoices = []
    }
    const endpointUrl = creds && creds.url || elevenLabsTtsEngine.defaultEndpointUrl
    const apiKey = creds && creds.apiKey || ""
    const model = creds && creds.model || ""
    const modelName = creds && creds.modelName || model
    const voiceList = creds ? (creds.voiceList || elevenLabsTtsEngine.defaultVoiceList) : []
    selectedModelId = model
    selectedVoiceIds = voiceList.map(item => item.voice)

    $card.find(".endpoint-url").text(endpointUrl)
    $card.find(".api-key").text(apiKey && (apiKey.slice(0, 13) + "*****" + apiKey.slice(-5)))
    $card.find(".model").text(modelName || "")
    $card.find(".voice-list").text(voiceList.map(x => x.name || x.voice).join(", "))

    $card.find(".txt-endpoint-url").val(endpointUrl)
    $card.find(".txt-api-key").val(apiKey)

    renderModelSelect()
    renderVoiceSelect()
  })

  status$.subscribe(status => {
    $card.find(".status.progress").toggle(status.type == "PROGRESS")
    $card.find(".status.error").toggle(status.type == "ERROR")
      .text(status.type == "ERROR" ? status.error.message : "")
  })

  listStatus$.subscribe(status => {
    $card.find(".list-status.progress").toggle(status.type == "PROGRESS")
    $card.find(".list-status.error").toggle(status.type == "ERROR")
      .text(status.type == "ERROR" ? status.error.message : "")
  })

  $card.find(".btn-add").click(() => {
    status$.next({type: "IDLE"})
    listStatus$.next({type: "IDLE"})
    editMode$.next(true)
    maybeLoadLists()
  })

  $card.find(".btn-edit").click(() => {
    status$.next({type: "IDLE"})
    listStatus$.next({type: "IDLE"})
    editMode$.next(true)
    maybeLoadLists()
  })

  $card.find(".btn-delete").click(() => {
    clearSettings(["elevenlabsCreds"])
    editMode$.next(false)
  })

  $card.find(".btn-refresh").click(() => {
    loadLists(true)
  })

  $modelSelect.on("change", () => {
    selectedModelId = $modelSelect.val() || ""
  })

  $voicesSelect.on("change", () => {
    selectedVoiceIds = $voicesSelect.val() || []
  })

  $card.find(".btn-save").click(async () => {
    try {
      const url = normalizeEndpoint(($card.find(".txt-endpoint-url").val() || "").trim() || elevenLabsTtsEngine.defaultEndpointUrl)
      const apiKey = ($card.find(".txt-api-key").val() || "").trim()
      const modelId = selectedModelId || (availableModels[0] && (availableModels[0].model_id || availableModels[0].id)) || ""
      const modelMeta = findModel(modelId)
      if (!modelId) throw new Error("Select an ElevenLabs model.")
      if (!selectedVoiceIds.length) throw new Error("Select at least one ElevenLabs voice.")

      const voiceList = buildVoiceList(modelId)

      const elevenlabsCreds = {
        url,
        apiKey,
        model: modelId,
        modelName: modelMeta && (modelMeta.name || modelMeta.model_id || modelMeta.id) || modelId,
        voiceList,
      }

      status$.next({type: "PROGRESS"})
      await elevenLabsTtsEngine.test(elevenlabsCreds)
      await updateSettings({elevenlabsCreds})
      status$.next({type: "IDLE"})
      editMode$.next(false)
    }
    catch (err) {
      status$.next({type: "ERROR", error: err})
    }
  })

  $card.find(".btn-cancel").click(() => {
    editMode$.next(false)
  })

  function maybeLoadLists() {
    const apiKey = ($card.find(".txt-api-key").val() || "").trim()
    if (apiKey && !availableModels.length && !availableVoices.length) {
      loadLists(false)
    }
  }

  async function loadLists(force) {
    const url = normalizeEndpoint(($card.find(".txt-endpoint-url").val() || "").trim() || elevenLabsTtsEngine.defaultEndpointUrl)
    const apiKey = ($card.find(".txt-api-key").val() || "").trim()
    if (!apiKey) {
      if (force) listStatus$.next({type: "ERROR", error: new Error("Provide an ElevenLabs API key to load models and voices.")})
      return
    }

    listStatus$.next({type: "PROGRESS"})
    try {
      const [models, voices] = await Promise.all([
        elevenLabsTtsEngine.fetchModels(apiKey, url),
        elevenLabsTtsEngine.fetchVoices(apiKey, url)
      ])
      availableModels = models
      availableVoices = voices
      if (!selectedModelId && models.length) {
        selectedModelId = models[0].model_id || models[0].id
      }
      if (!selectedVoiceIds.length && voices.length) {
        const firstVoice = voices[0]
        selectedVoiceIds = [firstVoice.voice_id || firstVoice.id || firstVoice.voice]
      }
      renderModelSelect()
      renderVoiceSelect()
      listStatus$.next({type: "IDLE"})
    }
    catch (err) {
      listStatus$.next({type: "ERROR", error: err})
    }
  }

  function renderModelSelect() {
    const select = $modelSelect.empty()
    const models = availableModels.length ? availableModels : (
      selectedModelId ? [{model_id: selectedModelId, name: selectedModelId}] : []
    )
    if (!models.length) {
      select.append($("<option>").val("").text("No data – use Reload to fetch models"))
      select.prop("disabled", true)
      return
    }
    select.prop("disabled", false)
    models.forEach(model => {
      const id = model.model_id || model.id || model
      const label = model.name || model.model_id || model.id || model
      $("<option>").val(id).text(label).appendTo(select)
    })
    if (selectedModelId && models.some(model => (model.model_id || model.id || model) == selectedModelId)) {
      select.val(selectedModelId)
    } else {
      selectedModelId = select.val() || ""
    }
  }

  function renderVoiceSelect() {
    const select = $voicesSelect.empty()
    const voices = availableVoices.length ? availableVoices : buildFallbackVoices()
    if (!voices.length) {
      select.append($("<option>").val("").text("No data – use Reload to fetch voices"))
      select.prop("disabled", true)
      return
    }
    select.prop("disabled", false)
    voices.forEach(voice => {
      const id = voice.voice_id || voice.id || voice.voice
      const name = voice.name || voice.displayName || voice.voice || id
      const lang = getVoiceLang(voice)
      const label = lang ? `${name} (${lang})` : name
      $("<option>").val(id).text(label).appendTo(select)
    })
    if (!selectedVoiceIds.length && voices.length) {
      selectedVoiceIds = [voices[0].voice_id || voices[0].id || voices[0].voice]
    }
    select.val(selectedVoiceIds)
  }

  function buildFallbackVoices() {
    const list = (currentCreds && currentCreds.voiceList) || elevenLabsTtsEngine.defaultVoiceList
    return list.map(item => ({
      voice_id: item.voice,
      name: item.name || item.voice,
      language: item.lang,
      settings: item.settings,
    }))
  }

  function buildVoiceList(modelId) {
    const voicesById = new Map()
    availableVoices.forEach(voice => voicesById.set(voice.voice_id || voice.id || voice.voice, voice))
    if (currentCreds && currentCreds.voiceList) {
      currentCreds.voiceList.forEach(item => {
        if (!voicesById.has(item.voice)) {
          voicesById.set(item.voice, {
            voice_id: item.voice,
            name: item.name || item.voice,
            language: item.lang,
            settings: item.settings,
          })
        }
      })
    }
    return selectedVoiceIds.map(id => {
      const voice = voicesById.get(id) || {voice_id: id}
      return {
        voice: id,
        name: voice.name || voice.displayName || voice.voice || id,
        lang: getVoiceLang(voice) || "en-US",
        model: modelId,
        ...(voice.settings ? {settings: voice.settings} : (voice.voice_settings ? {settings: voice.voice_settings} : {})),
      }
    })
  }

  function findModel(id) {
    return availableModels.find(model => (model.model_id || model.id || model) == id)
      || (currentCreds && currentCreds.model && (currentCreds.model == id ? {name: currentCreds.modelName, model_id: id} : null))
      || null
  }

  function getVoiceLang(voice) {
    return voice.lang
      || voice.language
      || (voice.labels && (voice.labels.language || voice.labels.language_code))
      || voice.language_code
      || (voice.accent ? `und-${voice.accent}` : null)
  }

  function normalizeEndpoint(url) {
    return url.replace(/\/$/, "")
  }
})

