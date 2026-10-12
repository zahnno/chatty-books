const validateEmail = (email) => {
  const re = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+)*)\@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return re.test(email);
}

const validateUsername = (username) => {
  const re = /^[a-zA-Z0-9]{3,30}$/;
  return re.test(username);
}

const validatePassword = (password) => {
  return password && password.length >= 6;
}

module.exports = {
  validateEmail,
  validateUsername,
  validatePassword
}