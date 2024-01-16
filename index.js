const WebSocket = require('ws')

const port = 9939
const server = new WebSocket.Server({ port: port })

let gameState = []

console.log(`running on ws://127.0.0.1:${port}`)

let sessionsManager = {
  sessions : {},

  create_session : function(host_socket, payload) {
    while (true) {
      var join_code = this._generate_join_code();

      if (join_code in this.sessions) continue;

      this.sessions[join_code] = {
        "host" : host_socket,
        "settings" : {
          "iterator" : 1,
          "in_progress" : false,
          "map_name" : payload.map_name,
          "max_players" : payload.max_players
        },
        "players" : {}
      };

      console.log('session created')
      return join_code;
    }
  },

  join_session : function(socket, join_code, player_data) {
    if (!(join_code in this.sessions)) return 0;

    if (Object.keys(this.sessions[join_code].players).length == this.sessions[join_code].settings.max_players) return 0;

    let peer_id = this.sessions[join_code].settings.iterator;
    this.sessions[join_code].players[peer_id] = {
      "socket" : socket,
      "player_data": player_data
    };
    this.sessions[join_code].settings.iterator += 1;

    let response_json = {
      "action" : "player_joined",
      "payload" : {
        "peer_id" : peer_id,
        "player_data" : player_data
      }
    }
    for (let other_peer_id in this.sessions[join_code].players) {
      if (other_peer_id != peer_id) {
        this.sessions[key].players[other_peer_id].socket.send(JSON.stringify(response_json));

        let other_player_data = {
          "action" : "player_joined",
          "payload" : {
            "peer_id" : other_peer_id,
            "player_data" : this.sessions[key].players[other_peer_id].player_data
          }
        }
        socket.send(JSON.stringify(other_player_data));
      }
    }

    return peer_id;
  },

  disconnect : function(socket) {
    for (let key in this.sessions) {
      if (this.sessions[key].host == socket) {
        let response_json = {
          "action" : "session_closed",
          "payload" : {}
        }
        for (let peer_id in this.sessions[key].players) {
          if (this.sessions[key].players[peer_id].socket != socket) {
            this.sessions[key].players[peer_id].socket.send(JSON.stringify(response_json));
          }
        }

        delete this.sessions[key];
        console.log('session destroyed');
        return;
      }

      for (let peer_id in this.sessions[key].players) {
        if (this.sessions[key].players[peer_id].socket == socket) {
          let response_json = {
            "action" : "player_disconnected",
            "payload" : {
              "peer_id" : peer_id
            }
          }
          for (let other_peer_id in this.sessions[key].players) {
            if (other_peer_id != peer_id) {
              this.sessions[key].players[other_peer_id].socket.send(JSON.stringify(response_json));
            }
          }

          delete this.sessions[key].players[peer_id];
          console.log('session disconnected');
          return;
        }
      }
    }
  },

  _generate_join_code : function() {
    return this._generate_code_chunk(6);
  },

  _generate_code_chunk : function(n) {
      var add = 1, max = 10 - add;
      if ( n > max ) {
        return this._generate_code_chunk(max) + this._generate_code_chunk(n - max);
      }
      
      max        = Math.pow(10, n+add);
      var min    = max/10;
      var number = Math.floor( Math.random() * (max - min + 1) ) + min;
      
      return ("" + number).substring(add); 
  }
};

server.on('connection', function(socket) {
  console.log('player connected')

  // When you receive a message, send that message to every socket.
  socket.on('message', function(msg) {
    console.log(`message: ${msg}`)

    let msg_json = JSON.parse(msg)

    if (!("action" in msg_json)) {
      console.log('malformed message')
      return;
    }

    if (msg_json.action == "host") {
      let response_json = {
        "action" : "hosted",
        "payload" : {
          "join_code" : sessionsManager.create_session(socket, msg_json.payload)
        }
      }
      socket.send(JSON.stringify(response_json))
    }

    if (msg_json.action == "join") {
      let response_json = {
        "action" : "joined",
        "payload" : {
          "peer_id" : sessionsManager.join_session(socket, msg_json.payload.join_code)
        }
      }
      socket.send(JSON.stringify(response_json))
    }

    if (msg_json.action == "message_direct") {
      let response_json = {
        "action" : "message",
        "peer_id" : msg_json.payload.source_id,
        "payload" : msg_json.payload.message
      }
      sessionsManager.sessions[msg_json.payload.join_code].players[msg_json.payload.target_id].socket.send(JSON.stringify(response_json))
    }

    if (msg_json.action == "message_broadcast") {
      let response_json = {
        "action" : "message",
        "peer_id" : msg_json.payload.source_id,
        "payload" : msg_json.payload.message
      }
      for (let other_peer_id in sessionsManager.sessions[msg_json.payload.join_code].players) {
        if (other_peer_id != msg_json.payload.source_id) {
          sessionsManager.sessions[msg_json.payload.join_code].players[other_peer_id].socket.send(JSON.stringify(response_json))
        }
      }
    }

  });

  // When a socket closes, or disconnects, remove it from the array.
  socket.on('close', function() {
    sessionsManager.disconnect(socket)
    console.log('player disconnected')
  });
});
