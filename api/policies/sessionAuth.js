/**
 * sessionAuth
 *
 * @module      :: Policy
 * @description :: Simple policy to allow any authenticated user
 *                 Assumes that your login action in one of your controllers sets `req.session.authenticated = true;`
 * @docs        :: http://sailsjs.org/#!/documentation/concepts/Policies
 *
 */
module.exports = function(req, res, next) {
    //Check if user is allowed
    if (req.session.user) {
      // User is active, proceed to the next policy,
      // or if this is the last policy, the controller
      if (req.session.user.active) {
        return next();
      }
      // If user is not active, show error
      return res.view('user/not_verified');
    }

    // User is not allowed
    // redirect to login page
    return res.redirect('/login');

};
