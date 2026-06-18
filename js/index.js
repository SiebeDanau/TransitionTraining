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

      card.innerHTML = `
        <h2>${module.title}</h2>
        <p>${module.description}</p>
      `;

      card.onclick = () => {
        window.location.href = module.file;
      };

      menu.appendChild(card);
    });
  });