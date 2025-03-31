/** Class used to manage physiological data
 * @class
 */

var Physio = function () {
  this.buffer = [];
  this.rawDataBuffer = []; // Buffer for raw data samples
  this.maxBufferSize = 256; // Store 1 second of data at 256 Hz
  this.lastSampleTime = 0;
  this.sampleCount = 0;
  this.lastSecondTime = 0;
  this.samplesPerPacket = 12; // Number of samples per packet from Muse device

  //channels 2,16,3,17

  // Set up filter
  sampleRate = 250;
  lowFreq = 7;
  highFreq = 30;
  filterOrder = 128;
  firCalculator = new Fili.FirCoeffs();
  coeffs = firCalculator.bandpass({
    order: filterOrder,
    Fs: sampleRate,
    F1: lowFreq,
    F2: highFreq,
  });
  filter = new Fili.FirFilter(coeffs);

  channels = {};
  window.psd = {};
  window.bands = {};
  tempSeriesData = {};
  isChannelDataReady = { 2: false, 16: false, 3: false, 17: false };
  this.SECONDS = 4;

  window.channelSampleCount = {};
  this.BUFFER_SIZE = this.SECONDS * 256;
  this.isConnected = false;

  this.addData = (sample, channel) => {
    const currentTime = Date.now();
    
    // Track timing
    if (this.lastSampleTime === 0) {
      this.lastSampleTime = currentTime;
      this.lastSecondTime = currentTime;
    }
    
    // Count samples
    this.sampleCount += sample.length; // Count all samples in the packet
    
    // Reset counter every second
    if (currentTime - this.lastSecondTime >= 1000) {
      this.sampleCount = 0;
      this.lastSecondTime = currentTime;
    }

    if (!channels[channel]) {
      channels[channel] = [];
      window.channelSampleCount[channel] = 0;
    }

    // Process each sample in the packet
    for (let i = 0; i < sample.length; i++) {
      // Add sample to channel buffer
      if (channels[channel].length > this.BUFFER_SIZE - 1) {
        channels[channel].shift();
      }
      channels[channel].push(sample[i]);
      window.channelSampleCount[channel] = window.channelSampleCount[channel] + 1;

      // Store individual raw data sample
      const rawSample = {
        timestamp: new Date().toISOString(),
        channel: channel,
        data: [sample[i]], // Store single sample
        sampleNumber: this.sampleCount + i,
        packetSize: 1
      };
      
      this.rawDataBuffer.push(rawSample);
      
      // Keep only the last second of data
      if (this.rawDataBuffer.length > this.maxBufferSize) {
        this.rawDataBuffer.shift();
      }
    }

    tempSeriesData[channel] = sample;
    isChannelDataReady[channel] = true;
  };

  this.getLenght = () => {
    return this.buffer.length;
  };

  this.getBuffer = () => {
    return this.buffer;
  };

  this.getRawDataBuffer = () => {
    return this.rawDataBuffer;
  };

  this.clearRawDataBuffer = () => {
    this.rawDataBuffer = [];
  };

  psdToPlotPSD = function (psd, max) {
    //console.log(psdToPlotPSD)
    out = [];
    for (i in psd) {
      //console.log(psd[i])
      out.push({ x: parseInt(i), y: psd[i] });
      if (i > max) {
        return out;
      }
    }
  };

  var getBandPower = (channel, band) => {
    if (!channels[channel]) return 0;

    if (channels[channel].length < this.BUFFER_SIZE) {
      return 0;
    }

    signal = filter.simulate(channels[channel]);
    let psd = window.bci.signal.getPSD(this.BUFFER_SIZE, channels[channel]);

    psd.shift();
    window.psd[channel] = psd;

    let bp = window.bci.signal.getBandPower(this.BUFFER_SIZE, psd, 256, band);

    return bp;
  };

  var getRelativeBandPower = (channel, band) => {
    var target = getBandPower(channel, band);
    var delta = getBandPower(channel, "delta");
    var theta = getBandPower(channel, "theta");
    var alpha = getBandPower(channel, "alpha");
    var beta = getBandPower(channel, "beta");
    var gamma = getBandPower(channel, "beta");
    return target / (delta + theta + alpha + beta + gamma);
  };

  var checkForVisualizationRefresh = function () {
    if (
      isChannelDataReady[2] &&
      isChannelDataReady[3] &&
      isChannelDataReady[16] &&
      isChannelDataReady[17]
    ) {
      // Reset channel ready flags
      isChannelDataReady[2] = false;
      isChannelDataReady[3] = false;
      isChannelDataReady[16] = false;
      isChannelDataReady[17] = false;

      // Calculate band powers regardless of visualization
      // tp9
      delta = getRelativeBandPower(2, "delta");
      theta = getRelativeBandPower(2, "theta");
      alpha = getRelativeBandPower(2, "alpha");
      beta = getRelativeBandPower(2, "beta");
      gamma = getRelativeBandPower(2, "gamma");
      totalPower = delta + theta + alpha + beta + gamma;
      window.bands["tp9"] = { delta, theta, alpha, beta, gamma, totalPower };

      // tp10
      delta = getRelativeBandPower(3, "delta");
      theta = getRelativeBandPower(3, "theta");
      alpha = getRelativeBandPower(3, "alpha");
      beta = getRelativeBandPower(3, "beta");
      gamma = getRelativeBandPower(3, "gamma");
      totalPower = delta + theta + alpha + beta + gamma;
      window.bands["tp10"] = { delta, theta, alpha, beta, gamma, totalPower };

      // AF8
      delta = getRelativeBandPower(17, "delta");
      theta = getRelativeBandPower(17, "theta");
      alpha = getRelativeBandPower(17, "alpha");
      beta = getRelativeBandPower(17, "beta");
      gamma = getRelativeBandPower(17, "gamma");
      totalPower = delta + theta + alpha + beta + gamma;
      window.bands["af8"] = { delta, theta, alpha, beta, gamma, totalPower };

      // AF7
      delta = getRelativeBandPower(16, "delta");
      theta = getRelativeBandPower(16, "theta");
      alpha = getRelativeBandPower(16, "alpha");
      beta = getRelativeBandPower(16, "beta");
      gamma = getRelativeBandPower(16, "gamma");
      totalPower = delta + theta + alpha + beta + gamma;
      window.bands["af7"] = { delta, theta, alpha, beta, gamma, totalPower };

      // Only update visualizations if the graphs exist
      if (window.bpGraph) {
        // Update band power graph
        var tp9Data = [{ x: 0, y: theta }, { x: 1, y: alpha }, { x: 2, y: beta }, { x: 3, y: gamma }];
        window.bpGraph.series[0].data = tp9Data;

        var tp10Data = [{ x: 0, y: theta }, { x: 1, y: alpha }, { x: 2, y: beta }, { x: 3, y: gamma }];
        window.bpGraph.series[1].data = tp10Data;

        var af8Data = [{ x: 0, y: theta }, { x: 1, y: alpha }, { x: 2, y: beta }, { x: 3, y: gamma }];
        window.bpGraph.series[2].data = af8Data;

        var af7Data = [{ x: 0, y: theta }, { x: 1, y: alpha }, { x: 2, y: beta }, { x: 3, y: gamma }];
        window.bpGraph.series[3].data = af7Data;
        window.bpGraph.update();
      }

      // Update PSD graph if it exists
      if (window.psdGraph && window.psd[2] && window.psd[3]) {
        //tp9
        psdPlotData = psdToPlotPSD(window.psd[2], 120);
        window.psdGraph.series[0].data = psdPlotData;

        //tp10
        psdPlotData = psdToPlotPSD(window.psd[3], 120);
        window.psdGraph.series[1].data = psdPlotData;

        //af7
        psdPlotData = psdToPlotPSD(window.psd[16], 120);
        window.psdGraph.series[2].data = psdPlotData;

        //af8
        psdPlotData = psdToPlotPSD(window.psd[17], 120);
        window.psdGraph.series[3].data = psdPlotData;
        window.psdGraph.update();
      }
    }
  };

  this.device = new Blue.BCIDevice((sample) => {
    let { electrode, data } = sample;
    this.addData(data, electrode);
    window.relativeBeta = getRelativeBandPower(2, "beta");
    checkForVisualizationRefresh();
  });

  this.start = () => {
    this.device.connect();
  };

  return this;
};

// document.getElementById("bluetooth").onclick = function (e) {
//   var physio = new Physio();
//   physio.start();
// };
