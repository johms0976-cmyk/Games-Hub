'use strict';
/* 1960, the telly with no server (the GitHub Pages copy). Loaded in telly.html
 * right after hub.js, before the page's own script.
 *
 * hub.js is the hub's own code. Three things change, and only here:
 *   - the socket comes from the room in the phone's page (solo-room.js), not
 *     from a server;
 *   - the room has one phone, so "the menu" means back to the Games Hub, and
 *     there is no room-wide claim of handsets (the room is this one phone);
 *   - there is no /diag to ask, and the sound is the phone page's own, so a
 *     tap on the phone unlocks it for the table too.
 */
(function (root) {
  const Hub = root.Hub;
  if (!Hub) return;

  Hub.makeSocket = function () {
    const room = root.parent && root.parent !== root ? root.parent.M60Room : null;
    if (!room) throw new Error('no room: open 1960 from its index.html');
    return room.hostSocket();
  };
  Hub.fetchDiag = function () {};
  Hub.claimPhones = function () {};
  /* The hub's join hop sends a handset to "/" when it arrives; the phone is
     already here, so the hop is a no-op the handset ignores. */
  Hub.phoneOrder = function () { return { t: 'here' }; };
  /* Back to the Games Hub, which is the folder above this game. */
  Hub.goto = function () {
    Hub.toAll({ t: 'goto', url: '../../' });
  };

  if (root.parent && root.parent.HubSound) root.HubSound = root.parent.HubSound;
})(typeof window !== 'undefined' ? window : globalThis);
