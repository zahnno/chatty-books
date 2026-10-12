const handleError = (res, error) => {
  console.error('Error:', error);
  
  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation error',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }

  // Handle Mongoose cast errors (invalid IDs)
  if (error.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid ID format'
    });
  }

  // Handle duplicate key errors
  if (error.code === 11000) {
    return res.status(409).json({
      message: 'Duplicate entry found'
    });
  }

  // Handle custom thrown errors with specific messages
  if (error.message) {
    return res.status(400).json({
      message: error.message
    });
  }

  // Default server error response
  return res.status(500).json({
    message: 'Internal server error'
  });
};

module.exports = {
  handleError
}; 