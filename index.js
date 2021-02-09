const express = require('express');
const cors = require('cors');
const Sequelize = require('sequelize');
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const config = require('./config/config');

// Auth0 Authentication middleware
const authCheck = jwt({
  secret: jwks.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${config.AUTH0_DOMAIN}/.well-known/jwks.json`
  }),
  audience: `${config.API_AUDIENCE_ATTRIBUTE}`,
  issuer: `https://${config.AUTH0_DOMAIN}/`,
  algorithms: ['RS256']
});

// Database setup
const sequelize = new Sequelize(process.env.DATABASE_URL);

const formats = {
  COLOR: {
    is: /^#([0-9A-F]{3}|[0-9A-F]{6})$/
  },
  STATUS: {
    isIn: [['Not started', 'In progress', 'On hold', 'Completed', 'Cancelled']]
  }
}

const Category = sequelize.define('category', {
  name: Sequelize.STRING,
  color: {
    type: Sequelize.STRING,
    validate: formats.COLOR
  }
});

const Task = sequelize.define('task', {
  summary: Sequelize.STRING,
  description: Sequelize.TEXT,
  status: {
    type: Sequelize.STRING,
    validate: formats.STATUS
  }
});

Task.belongsTo(Category);
Category.hasMany(Task);

Task.belongsTo(Task, {as: 'parent'});
Task.hasMany(Task, {as: 'subtasks', foreignKey: 'parentId'});

sequelize.sync();

sequelize.authenticate().then(() => {
  console.log('Connection has been established successfully.');
})
.catch(err => {
  console.log(`Unable to connect to the database:  ${err}`);
});

const app = express();

app.use(bodyParser.json());

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? `${config.PRODUCTION_HTTPS_SERVER}` : `${config.DEVELOPEMENT_HTTP_SERVER}`
}));

app.options('*', cors());

app.get('/tasks', authCheck, (req, res) => {

  Task.findAll({
    attributes: ['id', 'summary', 'status', 'description', 'categoryId', 'parentId'],
    include: [{
      model: Category,
      attributes: ['id', 'name', 'color']
    }]
  }).then(tasks => res.json(tasks));

});

app.get('/tasks/:taskId', authCheck, (req, res) => {

  Task.findOne({
    attributes: ['id', 'summary', 'status', 'description', 'categoryId', 'parentId'],
    where: {
      id: req.params.taskId
    },
    include: [
      {
        model: Category,
        attributes: ['id', 'name', 'color']
      }, {
        model: Task,
        as: 'subtasks',
        attributes: ['id', 'summary', 'description', 'parentId']
      }
    ]
  }).then(task => res.json(task));

});

app.post('/tasks', authCheck, (req, res) => {

  const {summary, status, description, categoryId, parentId} = req.body;

  Task.create({summary, status, description, categoryId, parentId}).then(newTask => {
    return res.json(newTask);
  }).catch(err => console.log(err));

});

app.post('/tasks/:taskId', authCheck, (req, res) => {

  const {summary, status, description, categoryId} = req.body;

  return Task.findOne({
    attributes: ['id', 'summary', 'status', 'description', 'categoryId', 'parentId'],
    where: {
      id: req.params.taskId
    },
    include: [
      {
        model: Category,
        attributes: ['id', 'name', 'color']
      }, {
        model: Task,
        as: 'subtasks',
        attributes: ['id', 'summary', 'status', 'description', 'parentId']
      }
    ]
  }).then(task => {
    return task.update({summary, status, description, categoryId}).then(updatedTask => {
      return res.json(updatedTask);
    }).catch(err => console.log(err));
  }).catch(err => console.log(err));

});

app.get('/categories', authCheck, (req, res) => {

  Category.findAll({
    attributes: ['id', 'name', 'color']
  }).then(categories => res.json(categories));

});

app.get('/categories/:categoryId', authCheck, (req, res) => {

  Category.findOne({
    attributes: ['id', 'name', 'color'],
    where: {
      id: req.params.categoryId
    }
  }).then(category => res.json(category));

});

app.get('/categories/:categoryId/tasks', authCheck, (req, res) => {

  Task.findAll({
    attributes: ['id', 'summary', 'description', 'parentId', 'categoryId'],
    where: {
      parentId: null,
      categoryId: req.params.categoryId
    }
  }).then(tasks => res.json(tasks));

});

app.post('/categories', authCheck, (req, res) => {

  const {name, color} = req.body;

  Category.create({name, color}).then(newCategory => {
    return res.json(newCategory);
  }).catch(err => console.log(err));

});

app.post('/categories/:categoryId', authCheck, (req, res) => {

  const {name, color} = req.body;

  return Category.findOne({
    attributes: ['id', 'name', 'color'],
    where: {
      id: req.params.categoryId
    }
  }).then(category => {
    return category.update({name, color}).then(updatedCategory => {
      return res.json(updatedCategory);
    }).catch(err => console.log(err));
  }).catch(err => console.log(err));

});



app.get('/*', (req, res) => {
  return res.send('Content not found! Check your url.');
});

const port = process.env.PORT || 5000;
app.listen(port);

console.log(`Scheduler listening on ${port}`);