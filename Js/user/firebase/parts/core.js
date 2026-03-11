// DEPRECATED shim — Firebase wrapper moved to `databasehfs/users/user-database.js`
// This file remains for compatibility; load the new module instead.
console.warn('Js/user/firebase.js is deprecated — moved to databasehfs/users/user-database.js.');
if (window.usersDatabase) {
  window.homefixDB = window.usersDatabase;
} else if (!window.homefixDB) {
  window.homefixDB = {
    warn: function(){ console.warn('usersDatabase not loaded yet'); }
  };
}
