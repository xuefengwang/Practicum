"use strict";

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const config = require(process.env['HOME'] + '/iot_api.json');
const mysql = require('mysql');

const indexRouter = require('./routes/index');

function setup(config, next) {
  const pool = mysql.createPool(config.datasource);
  console.log('Connect to database', config.datasource.host, config.datasource.user);
  next(null, pool);
}

function startApi(err, dbPool) {
  const app = express();

  app.use(logger('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use('*', (req, res, next) => {
    req.db = dbPool;
    next();
  })
  app.use('/api', indexRouter);

  // catch 404 and forward to error handler
  app.use(function (req, res, next) {
    next(createError(404));
  });

  // error handler
  app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    console.log(err);
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.json({ error: "ERROR" });
  });

  app.listen(config.listenPort, function () {
    console.log('Server started at', config.listenPort);
  });
}

setup(config, startApi);
