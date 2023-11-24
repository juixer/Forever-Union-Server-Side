const express = require('express');
const app = express();

const cors = require('cors');
const port =  process.env.PORT || 5000

app.use(express.json())
app.use(cors())


app.get('/', (req,res) => {
    res.send('Welcome to the Forever Server')
})

app.all('*', (req,res,next) => {
    const error = new Error (`The requested URL is invalid: ${req.url}`)
    error.status = 404;
    next(error);
})

app.use((err, req, res,next) => {
    res.status(err.status || 500).json({
        message: err.message
    })
})

app.listen(port, () => {
    console.log(`you are listening on ${port}`);
  });
