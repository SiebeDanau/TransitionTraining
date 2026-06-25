fetch("data/config.json")
  .then(res => res.json())
  .then(config => {
    const menu = document.getElementById("menu");

    config.modules.forEach(module => {
      const card = document.createElement("div");
      card.style.border = "1px solid #ccc";
      card.style.padding = "10px";
      card.style.margin = "10px";
      card.style.cursor = "pointer";

      if (module.description != "") {
          card.innerHTML = `
            <h2>${module.title}</h2>
            <p>${module.description}</p>
          `;
      }
      else {
         card.innerHTML = `
            <h2>${module.title}</h2>
          `;
      }

      card.onclick = () => {
        openModule(module);
      };

      menu.appendChild(card);
    });
  });

  function openModule(module) {
    if (module.type === "map") {
        localStorage.setItem("activeModule", JSON.stringify(module));
        console.log("JSON" + JSON.stringify(module));
        window.location.href = "map.html";
    }
    if (module.type === "geo-svg") {
        localStorage.setItem("activeModule", JSON.stringify(module));
        window.location.href = "geo-svg.html";
    }
}
