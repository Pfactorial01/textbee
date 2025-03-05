#!/bin/bash

# Stop and remove existing container
sudo docker stop api_cont || true
sudo docker rm api_cont || true

# Remove existing image
sudo docker rmi api || true

# Build new image
sudo docker build -t api api/.

# Run new container
sudo docker run -d --name api_cont \
  -v /home/local/textbee/api:/usr/src/app \
  -v /usr/src/app/node_modules \
  --privileged --network host \
  -e MONGO_URI=mongodb://172.17.0.3:27017/ \
  -e DISPLAY=:99 \
  api


# # Stop and remove existing container
# sudo docker stop new_portal_cont || true
# sudo docker rm new_portal_cont || true

# # Remove existing image
# sudo docker rmi new_portal || true

# # Build new image
# sudo docker build -t new_portal new_portal/.

# sudo docker run -d --name new_portal_cont -v /home/local/textbee/new_portal:/code1 -p 8000:8000 new_portal
