Systemd service template for ECE312 webserver

Place the service file at `/etc/systemd/system/ece312-webserver.service` (edit WorkingDirectory and User).

Example steps:

```bash
# Copy service file (run as root)
sudo cp deploy/ece312-webserver.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ece312-webserver.service
sudo journalctl -u ece312-webserver -f
```

Optional: Port forwarding from 80 to 8080 (run as root once):

```bash
# Forward port 80 to 8080
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080
```

Alternative: configure nginx as a reverse proxy for better production behavior.

Nginx reverse-proxy example
---------------------------

An example nginx server block is included at `deploy/nginx/ece312.conf`. Example steps to enable it on Debian/Ubuntu:

```bash
sudo cp deploy/nginx/ece312.conf /etc/nginx/sites-available/ece312.conf
sudo ln -s /etc/nginx/sites-available/ece312.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Adjust `server_name` and `client_max_body_size` in the config as needed.

Security notes:
- Do not run node as root. Use a system account and a reverse proxy or port forwarding when exposing on port 80.
