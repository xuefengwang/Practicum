const WIDTH = 800;
const HEIGHT = 500;

// D3 Projection
const projection = d3.geo.mercator()
  .scale(126)
  .translate([WIDTH / 2, HEIGHT / 2]);    // translate to center of screen

// Define path generator
const path = d3.geo.path()               // path generator that will convert GeoJSON to SVG paths
  .projection(projection);  // tell path generator to use albersUsa projection

const svg = d3.select("body")
  .append("svg")
  .attr("width", WIDTH)
  .attr("height", HEIGHT);

// const curve = d3.svg.line().curve(d3.curveNatural)

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

  svg.selectAll("circle")
    .data([
      [
        [-122.490402, 37.786453]
      ],
      [
        [-97.516428, 35.467560]
      ]
    ])
    .enter()
    .append("circle")
    .attr("cx", d => projection(d[0])[0])
    .attr("cy", d => projection(d[0])[1])
    .attr("r", "5")
    .style("fill", "rgb(217,91,67)")
    .style("opacity", 0.85);
});
