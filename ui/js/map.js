'use strict';

const API_SERVICE = "http://localhost:3000/api"
const WIDTH = 800;
const HEIGHT = 500;
window.iot_state = {
  duration: 1
}

// D3 Projection
const projection = d3.geo.mercator()
  .scale(126)
  .translate([WIDTH / 2, HEIGHT / 2]);    // translate to center of screen

// Define path generator
const path = d3.geo.path()               // path generator that will convert GeoJSON to SVG paths
  .projection(projection);  // tell path generator to use albersUsa projection

const svg = d3.select("svg")
  .attr("width", WIDTH)
  .attr("height", HEIGHT);

d3.json("world-110m.json", (err, topoJson) => {
  if (err) console.log(err);

  svg.selectAll("path")
    .data(topoJson.features)
    .enter()
    .append("path")
    .attr("d", path)
    .style("stroke", "#fff")
    .style("stroke-width", "1")
    .style("fill", "rgb(213, 222, 217)");

  drawMap(1); // by default 1 hour
});

setup();


function setup() {
  $("#duration-list > .duration").on("click", e => {
    $('#duration-list > .duration.positive').removeClass('positive');
    e.currentTarget.classList.add('positive');
    const duration = e.currentTarget.value;
    console.log("change duration:", duration);
    window.iot_state.duration = duration;
    drawMap(duration);
  });
}

function drawMap(duration) {
  d3.json(API_SERVICE + `/packets?duration=${duration}`, d => {
    const locs = d.packets.list.map(ll => [[ll.longitude, ll.latitude]]);
    console.log(locs.join(',\t'));
    window.iot_state.locs = d.packets.list;
    svg.selectAll("circle").remove();
    svg.selectAll("circle")
      .data(locs)
      .enter()
      .append("circle")
      .attr("cx", d => projection(d[0])[0])
      .attr("cy", d => projection(d[0])[1])
      .attr("r", "5")
      .attr("lat", d => d[0][1])
      .attr("lng", d => d[0][0])
      .style("fill", "rgb(217,91,67)")
      .style("opacity", 0.85);

    $("circle").on("click", e => {
      let lat = e.currentTarget.getAttribute("lat");
      let lng = e.currentTarget.getAttribute("lng");
      window.iot_state.coord = {lat: lat, lng: lng};
      console.log("get loc:", lat, lng);
      d3.json(API_SERVICE + `/loc?lat=${lat}&lng=${lng}&duration=${window.iot_state.duration}`, d => {

        console.log("packet at loc:", d);
        updateDetailList(d.loc_packets);
      });
    });

    updateSummaryList(d.packets.list, duration);
  });
}

function updateDetailList(data) {
  const coord = window.iot_state.coord;
  const selectedLoc = window.iot_state.locs.filter(d => d.latitude === coord.lat && d.longitude === coord.lng)[0];
  d3.select("#list-title").attr("colspan", "4").text(`Packets in last ${window.iot_state.duration} hour(s) for ${selectedLoc.city}, 
    ${selectedLoc.state_province}, ${selectedLoc.country_code}`);
  d3.select("#list-column").selectAll("th").remove();
  d3.select("#list-column").html("<th>Time</th><th>Source</th><th>Destination</th><th>Size</th>");
  const listBody = d3.select("#list-body");
  listBody.selectAll("tr").remove();
  listBody.selectAll("tr")
    .data(data)
    .enter()
    .append("tr")
    .html(d => {
      return `<td>${d.packet_time}</td><td>${d.src_ip}</td><td>${d.dst_ip}</td><td>${d.size}</td>`;
    });
}

function updateSummaryList(data, duration) {
  d3.select("#list-title").attr("colspan", "3").text(`Number of packets in the last ${duration} hour(s) for all devices by location`)
  d3.select("#list-column").selectAll("th").remove();
  d3.select("#list-column").html("<th>Location</th><th>Coordinate</th><th>Packets</th>");
  const listBody = d3.select("#list-body");
  listBody.selectAll("tr").remove();
  listBody.selectAll("tr")
    .data(data)
    .enter()
    .append("tr")
    .html(d => {
      return `<td>${d.city}, ${d.state_province}, ${d.country_code} ${d.zip}</td>
            <td>(${d.latitude}, ${d.longitude})</td><td>${d.sum}</td>`;
    });
}
