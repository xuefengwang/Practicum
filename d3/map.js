const WIDTH = 800;
const HEIGHT = 500;

// D3 Projection
const projection = d3.geo.albersUsa()
  // .translate([WIDTH / 2, HEIGHT / 2])    // translate to center of screen
  .scale([1000]);          // scale things down so see entire US

// Define path generator
const path = d3.geo.path()               // path generator that will convert GeoJSON to SVG paths
  .projection(projection);  // tell path generator to use albersUsa projection

const svg = d3.select("body")
  .append("svg")
  .attr("width", WIDTH)
  .attr("height", HEIGHT);

// const curve = d3.svg.line().curve(d3.curveNatural)

d3.json("us-states.json", (err, topoJson) => {
  if (err) console.log(err);

  svg.selectAll("path")
    .data(topoJson.features)
    .enter()
    .append("path")
    .attr("d", path)
    .style("stroke", "#fff")
    .style("stroke-width", "1")
    .style("fill", "rgb(213, 222, 217)");

  svg.selectAll("line")
    .data([
      [
        [-122.490402, 37.786453], [-97.516428, 35.467560]
      ]
    ])
    .enter()
    .append("line")
    .attr("x1", d => projection(d[0])[0])
    .attr("y1", d => projection(d[0])[1])
    .attr("x2", d => projection(d[1])[0])
    .attr("y2", d => projection(d[1])[1])
    .attr("stroke-width", 1)
    .attr("stroke", "black");

});
